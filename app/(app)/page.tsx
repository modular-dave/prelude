import { ChatPanel } from "@/components/chat/chat-panel";
import { FloatNav } from "@/components/shell/float-nav";

export default function ChatPage() {
  return (
    <div className="relative h-full">
      <ChatPanel />
      <FloatNav route="chat" />
    </div>
  );
}
