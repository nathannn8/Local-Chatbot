# LocalChat AI

A local AI chat interface with RAG and web search capabilities.

## Features
- Chat with a local LLM (llama3.2 via Ollama)
- Upload PDFs and query them using RAG
- Web search via Tavily
- Authentication system

## Tech Stack
- Frontend: React + Vite
- Backend: FastAPI
- LLM: Ollama (llama3.2:1b)
- Embeddings: nomic-embed-text
- Vector DB: ChromaDB
- PDF Parsing: Docling
- Web Search: Tavily MCP

## Setup

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

### Frontend
```bash
npm install
npm run dev
```

### Requirements
- Ollama installed with llama3.2:1b and nomic-embed-text pulled
- Tavily API key in backend/.env