# LocalChat AI

An AI chat interface with RAG and multiple tools.

## Features
- Chat with a Groq LLM
- Upload PDFs and query them using RAG
- Web search via Tavily
- Excel data parser
- Chart maker
- Authentication system

## Tech Stack
- Frontend: React + Vite
- Backend: FastAPI
- LLM: Groq API
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
- Groq API and nomic-embed-text pulled
- Tavily API key in backend/.env
