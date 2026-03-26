from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi import UploadFile, File
import shutil
import os
from docling.document_converter import DocumentConverter
import ollama
import chromadb
import asyncio
from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client

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
    # fixed: use "py" for Windows, correct filenames
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

                    # fixed: system prompt matches actual tool names
                    messages = [
                        {"role": "system", "content": "You are a helpful assistant. You have two tools: use document_search to answer questions about uploaded documents/PDFs, and use web_search to find information on the web. Always use a tool to answer — never answer from memory."},
                        {"role": "user", "content": query}
                    ]

                    response = ollama.chat(
                        model="llama3.2:1b",
                        messages=messages,
                        tools=all_tools
                    )

                    if response.message.tool_calls:
                        for tool_call in response.message.tool_calls:
                            tool_name = tool_call.function.name
                            tool_args = dict(tool_call.function.arguments)

                            # fixed: route by actual tool names
                            if tool_name == "document_search":
                                result = await rag_session.call_tool(tool_name, tool_args)
                            else:
                                result = await tavily_session.call_tool(tool_name, tool_args)

                            tool_data = result.content[0].text
                            messages.append({"role": "assistant", "content": str(response.message)})
                            messages.append({"role": "tool", "content": tool_data})

                        final = ollama.chat(model="llama3.2:1b", messages=messages)
                        return final.message.content
                    else:
                        return response.message.content

@app.post("/chat")
def chat(data: dict):
    query = data["message"]
    reply = asyncio.run(run_with_mcp(query))
    return {"reply": reply}