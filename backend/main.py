import os
import json
import asyncio
import shutil
from typing import List, Dict
from contextlib import asynccontextmanager

from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv

from docling.document_converter import DocumentConverter
from groq import Groq
import ollama
import chromadb
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

load_dotenv()

db_client = chromadb.PersistentClient(path="./chromadb")
collection = db_client.get_or_create_collection(name="documents")

groq_client = Groq(api_key=os.getenv("GROQ_API_KEY"))

EXCEL_MODEL = "llama-3.3-70b-versatile"
GENERAL_MODEL = "openai/gpt-oss-120b"

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
                        "parameters": {
                            "type": "object",
                            "properties": t.inputSchema.get("properties", {}),
                            "required": t.inputSchema.get("required", [])
                        }
                    }
                })
        return all_tools

    async def call_tool(self, tool_name: str, arguments: dict):
        if tool_name == "document_search":
            return await self.sessions["rag"].call_tool(tool_name, arguments)
        elif tool_name == "web_search":
            return await self.sessions["tavily"].call_tool(tool_name, arguments)
        elif tool_name == "execute_excel_query":
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

def is_excel_query(message: str) -> bool:
    return any(x in message.lower() for x in [".xlsx", ".xls", "excel", "spreadsheet"])

async def handle_excel_query(message: str, tools: List[Dict]) -> str:
    excel_tool = [t for t in tools if t["function"]["name"] == "execute_excel_query"]
    messages = [
        {
            "role": "system",
            "content": (
                "You are an Excel data analyst. Use execute_excel_query to analyze Excel files. "
                "The file columns are: Month, Product, Revenue, Units Sold, Region. "
                "ALWAYS use this exact code pattern for revenue by month: "
                "df = pd.read_excel(filename); result = df.groupby('Month')['Revenue'].sum().to_dict() "
                "Store answer in 'result' variable. Never describe what to do, just call the tool."
            )
        },
        {"role": "user", "content": message}
    ]

    response = groq_client.chat.completions.create(
        model=EXCEL_MODEL,
        messages=messages,
        tools=excel_tool,
        tool_choice="auto"
    )

    response_message = response.choices[0].message

    if response_message.tool_calls:
        messages.append(response_message)
        result_text = ""
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
                result_text = f"Error: {str(e)}"
                messages.append({
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_call.function.name,
                    "content": result_text
                })

        # now add the follow-up after tool result is available
        messages.append({
            "role": "user",
            "content": f"The tool returned: {result_text}. Give me a clear natural language answer."
        })

        final = groq_client.chat.completions.create(
            model=EXCEL_MODEL,
            messages=messages,
            tools=excel_tool,
            tool_choice="none"
        )
        return final.choices[0].message.content or "Could not generate summary."

    return response_message.content or "No response generated."

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

    if is_excel_query(request.message):
        reply = await handle_excel_query(request.message, tools)
        return {"reply": reply}

    general_tools = [t for t in tools if t["function"]["name"] != "execute_excel_query"]
    messages = [
        {
            "role": "system",
            "content": (
                "You are a helpful AI assistant with access to two tools: "
                "1. document_search - search uploaded PDF documents "
                "2. web_search - search the web for current information. "
                "Use the right tool for each question."
            )
        },
        {"role": "user", "content": request.message}
    ]

    response = groq_client.chat.completions.create(
        model=GENERAL_MODEL,
        messages=messages,
        tools=general_tools,
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
                    "content": f"Error: {str(e)}"
                })

        final_response = groq_client.chat.completions.create(
            model=GENERAL_MODEL,
            messages=messages,
            tools=general_tools,
            tool_choice="none"
        )
        reply = final_response.choices[0].message.content
        return {"reply": reply if reply else "Tool ran but no summary generated."}

    reply = response_message.content
    return {"reply": reply if reply else "No response generated. Please try again."}

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