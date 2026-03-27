import os
import json
import asyncio
import shutil
from typing import List, Dict
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from docling.document_converter import DocumentConverter
from openai import OpenAI
import ollama
import chromadb
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

load_dotenv()

db_client = chromadb.PersistentClient(path="./chromadb")
collection = db_client.get_or_create_collection(name="documents")

router_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY")
)

MODEL = "openrouter/free"

class MCPManager:
    def __init__(self):
        self.sessions = {}
        self.transports = {}
        self.configs = {
            "rag": StdioServerParameters(command="py", args=["rag_server.py"]),
            "tavily": StdioServerParameters(command="py", args=["tavily_search.py"]),
            "excel": StdioServerParameters(command="py", args=["excel_server.py"])
        }

    async def initialize(self):
        for key, params in self.configs.items():
            transport = stdio_client(params)
            read, write = await transport.__aenter__()
            self.transports[key] = transport
            session = ClientSession(read, write)
            await session.__aenter__()
            await session.initialize()
            self.sessions[key] = session
        print("MCP Servers initialized and ready.")

    async def get_tools_metadata(self) -> List[Dict]:
        all_tools = []
        for name, session in self.sessions.items():
            tool_list = await session.list_tools()
            for t in tool_list.tools:
                all_tools.append({
                    "type": "function",
                    "function": {
                        "name": t.name,
                        "description": t.description,
                        "parameters": t.inputSchema
                    }
                })
        return all_tools

    async def call_tool(self, tool_name: str, arguments: dict):
        if tool_name == "document_search":
            return await self.sessions["rag"].call_tool(tool_name, arguments)
        elif tool_name == "web_search":
            return await self.sessions["tavily"].call_tool(tool_name, arguments)
        elif tool_name == "execute_excel_query":  # ← missing!
            return await self.sessions["excel"].call_tool(tool_name, arguments)
        raise ValueError(f"Tool {tool_name} not found")

mcp_manager = MCPManager()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await mcp_manager.initialize()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str

@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    temp_path = f"temp_{file.filename}"
    try:
        with open(temp_path, "wb") as f:
            shutil.copyfileobj(file.file, f)
        converter = DocumentConverter()
        result = converter.convert(temp_path)
        text = result.document.export_to_markdown()
        chunks = [c.strip() for c in text.split('\n\n') if len(c.strip()) > 100]
        for i, chunk in enumerate(chunks):
            embed_res = ollama.embeddings(model="nomic-embed-text", prompt=chunk)
            collection.add(
                ids=[f"{file.filename}_{i}"],
                embeddings=[embed_res["embedding"]],
                documents=[chunk]
            )
        return {"status": "success", "chunks_stored": len(chunks)}
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)

@app.post("/chat")
async def chat(request: ChatRequest):
    tools = await mcp_manager.get_tools_metadata()
    messages = [
        {
            "role": "system",
            "content": (
                    "You are an AI assistant with access to these tools: "
                    "document_search, web_search, and execute_excel_query. "
                    "IMPORTANT: When the user mentions any .xlsx or .xls file, "
                    "you MUST call execute_excel_query with the filename and "
                    "pandas code to answer the question. "
                    "Example: if asked 'total revenue in sales_data.xlsx', call "
                    "execute_excel_query with filename='sales_data.xlsx' and "
                    "code='df = pd.read_excel(filename); result = df[\"Revenue\"].sum()'. "
                    "NEVER say you cannot access files. Always use the tool."
                    "When the user asks about ANY .xlsx or .xls file, "
                    "you MUST ALWAYS use execute_excel_query. "
                    "NEVER use web_search for Excel file questions. "
                    "Excel files are local files, not on the web."
            )
        },
        {"role": "user", "content": request.message}
    ]

    response = router_client.chat.completions.create(
        model=MODEL,
        messages=messages,
        tools=tools,
        tool_choice="auto"
    )

    response_message = response.choices[0].message

    if response_message.tool_calls:
        messages.append(response_message)
        for tool_call in response_message.tool_calls:
            try:
                tool_args = json.loads(tool_call.function.arguments)
                tool_result = await mcp_manager.call_tool(tool_call.function.name, tool_args)
                result_text = tool_result.content[0].text
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_call.function.name,
                    "content": result_text
                })
            except Exception as e:
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_call.function.name,
                    "content": f"Error executing tool: {str(e)}"
                })

        final_response = router_client.chat.completions.create(
            model=MODEL,
            messages=messages
        )
        return {"reply": final_response.choices[0].message.content}

    return {"reply": response_message.content}

@app.post("/upload/excel")
async def upload_excel(file: UploadFile = File(...)):
    uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    file_path = os.path.join(uploads_dir, file.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"status": "success", "filename": file.filename}

@app.post("/auth/login")
async def login(data: dict):
    return {"token": "local-token", "username": data["username"]}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)