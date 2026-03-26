from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File
import shutil
import os
from docling.document_converter import DocumentConverter
from openai import OpenAI
import ollama
import chromadb
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client
from dotenv import load_dotenv

load_dotenv()

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

db_client = chromadb.PersistentClient(path="./chromadb")
collection = db_client.get_or_create_collection(name="documents")

router_client = OpenAI(
    base_url="https://openrouter.ai/api/v1",
    api_key=os.getenv("OPENROUTER_API_KEY")
)

MODEL = "meta-llama/llama-3.1-8b-instruct:free"

@app.post("/upload")
def upload_pdf(file: UploadFile = File(...)):
    temp_path = f"temp_{file.filename}"
    with open(temp_path, "wb") as f:
        shutil.copyfileobj(file.file, f)
    converter = DocumentConverter()
    result = converter.convert(temp_path)
    text = result.document.export_to_markdown()
    chunks = text.split('\n\n')
    chunks = [c.strip() for c in chunks if len(c.strip()) > 100]
    for i, chunk in enumerate(chunks):
        embed_response = ollama.embeddings(model="nomic-embed-text", prompt=chunk)
        embedding = embed_response["embedding"]
        collection.add(
            ids=[f"{file.filename}_chunk_{i}"],
            embeddings=[embedding],
            documents=[chunk]
        )
    os.remove(temp_path)
    return {"message": f"Stored {len(chunks)} chunks from {file.filename}"}

async def run_with_mcp(query: str):
    rag_params = StdioServerParameters(command="py", args=["rag_server.py"])
    tavily_params = StdioServerParameters(command="py", args=["tavily_search.py"])

    async with stdio_client(rag_params) as (r1, w1):
        async with ClientSession(r1, w1) as rag_session:
            await rag_session.initialize()
            async with stdio_client(tavily_params) as (r2, w2):
                async with ClientSession(r2, w2) as tavily_session:
                    await tavily_session.initialize()
                    rag_tools = await rag_session.list_tools()
                    tavily_tools = await tavily_session.list_tools()
                    all_tools = [{
                        "type": "function",
                        "function": {
                            "name": t.name,
                            "description": t.description,
                            "parameters": t.inputSchema
                        }
                    } for t in rag_tools.tools + tavily_tools.tools]

                    messages = [
                        {"role": "system", "content": "You are a helpful assistant. Use document_search for questions about uploaded documents and web_search for web questions. Always use a tool."},
                        {"role": "user", "content": query}
                    ]

                    response = router_client.chat.completions.create(
                        model=MODEL,
                        messages=messages,
                        tools=all_tools
                    )

                    if response.choices[0].message.tool_calls:
                        for tool_call in response.choices[0].message.tool_calls:
                            tool_name = tool_call.function.name
                            tool_args = eval(tool_call.function.arguments)

                            if tool_name == "document_search":
                                result = await rag_session.call_tool(tool_name, tool_args)
                            else:
                                result = await tavily_session.call_tool(tool_name, tool_args)

                            tool_data = result.content[0].text
                            messages.append({"role": "assistant", "content": None, "tool_calls": [tool_call]})
                            messages.append({"role": "tool", "content": tool_data, "tool_call_id": tool_call.id})

                        final = router_client.chat.completions.create(
                            model=MODEL,
                            messages=messages
                        )
                        return final.choices[0].message.content
                    else:
                        return response.choices[0].message.content

@app.post("/chat")
def chat(data: dict):
    query = data["message"]
    reply = asyncio.run(run_with_mcp(query))
    return {"reply": reply}