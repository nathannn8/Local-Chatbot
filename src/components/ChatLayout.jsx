import { useState } from 'react';
import Sidebar from './Sidebar';
import ChatPanel from './ChatPanel';

export default function ChatLayout() {
  const [pdfs, setPdfs] = useState([]);
  const [excels, setExcels] = useState([]);

  return (
    <div className="chat-layout">
      <Sidebar pdfs={pdfs} setPdfs={setPdfs} excels={excels} setExcels={setExcels} />
      <ChatPanel />
    </div>
  );
}
