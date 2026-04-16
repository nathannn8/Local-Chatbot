import os
import json
import ast
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
GENERAL_MODEL = "llama-3.3-70b-versatile" # Switched to match for consistency

class MCPManager:
    def __init__(self):
        self.sessions = {}
        self.transports = {}
        self.configs = {
            "rag": StdioServerParameters(command="python", args=["rag_server.py"]),
            "tavily": StdioServerParameters(command="python", args=["tavily_search.py"]),
            "excel": StdioServerParameters(command="python", args=["excel_server.py"])
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
    allow_origins=["*"], # Simplified for local testing
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ChatRequest(BaseModel):
    message: str

def is_excel_query(message: str) -> bool:
    return any(x in message.lower() for x in [".xlsx", ".xls", "excel", "spreadsheet", "plot", "chart"])

async def handle_excel_query(message: str, tools: List[Dict]) -> dict:
    excel_tool = [t for t in tools if t["function"]["name"] == "execute_excel_query"]
    messages = [
        {
            "role": "system",
            "content": (
                "You are an Excel data analyst. You MUST call execute_excel_query tool. "
                "The user wants visual data. "
                "For charts, write python code that creates a dictionary called 'result'. "
                "Example for pie chart: "
                "df = pd.read_excel(filename); monthly = df.groupby('Month')['Revenue'].sum(); "
                "result = {'chart_type': 'pie', 'labels': list(monthly.index), 'values': [float(v) for v in monthly.values], 'title': 'Revenue by Month'} "
                "Always ensure values are standard Python floats/ints, not numpy types."
            )
        },
        {"role": "user", "content": message}
    ]

    response = groq_client.chat.completions.create(
        model=EXCEL_MODEL,
        messages=messages,
        tools=excel_tool,
        tool_choice="required"
    )

    response_message = response.choices[0].message

    if response_message.tool_calls:
        tool_call = response_message.tool_calls[0]
        tool_args = json.loads(tool_call.function.arguments)
        tool_result = await mcp_manager.call_tool(tool_call.function.name, tool_args)
        result_text = tool_result.content[0].text


        # Check if the tool output looks like a chart dictionary
        if "chart_type" in result_text:
            try:
                # Clean the string in case of backticks or extra text
                clean_text = result_text.replace("```python", "").replace("```", "").strip()
                parsed = ast.literal_eval(clean_text)
                if isinstance(parsed, dict) and "chart_type" in parsed:
                    return {
                        "reply": f"I've generated the {parsed.get('title', 'chart')} for you.",
                        "chart": parsed
                    }
            except Exception as e:
                print(f"Parsing error: {e}")


        # If not a chart, provide natural language summary
        messages.append(response_message)
        messages.append({
            "role": "tool",
            "tool_call_id": tool_call.id,
            "name": tool_call.function.name,
            "content": result_text
        })
        
        final = groq_client.chat.completions.create(
            model=EXCEL_MODEL,
            messages=messages
        )
        return {"reply": final.choices[0].message.content}

    return {"reply": "I couldn't process that excel request."}

@app.post("/chat")
async def chat(request: ChatRequest):
    tools = await mcp_manager.get_tools_metadata()

    if is_excel_query(request.message):
        return await handle_excel_query(request.message, tools)

    # General chat logic...
    general_tools = [t for t in tools if t["function"]["name"] != "execute_excel_query"]
    messages = [{"role": "system", "content": "You are a helpful assistant."}, {"role": "user", "content": request.message}]
    
    response = groq_client.chat.completions.create(model=GENERAL_MODEL, messages=messages, tools=general_tools)
    # ... (rest of your existing /chat logic)
    return {"reply": response.choices[0].message.content}

@app.post("/upload/excel")
async def upload_excel(file: UploadFile = File(...)):
    uploads_dir = os.path.join(os.path.dirname(__file__), "uploads")
    os.makedirs(uploads_dir, exist_ok=True)
    file_path = os.path.join(uploads_dir, file.filename)
    with open(file_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    return {"status": "success", "filename": file.filename}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
