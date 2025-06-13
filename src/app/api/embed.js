// pages/embed.js
import ChatBot from '../components/ChatBot';

export default function ChatEmbed() {
  return (
    <div style={{ height: '100vh' }}>
      <ChatBot />
    </div>
  );
}

// Skip any auth checks here!
export const getServerSideProps = async (ctx) => ({
  props: {}
});
