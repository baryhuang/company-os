export interface ChannelMessage {
  id: string;
  chat_id: string;
  text: string;
  timestamp: string;
}

interface PollChannelMessagesResponse {
  messages: ChannelMessage[];
  cursor: string;
}

export async function sendChannelMessage(text: string, user?: string): Promise<void> {
  const response = await fetch('/channel/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ text, user }),
  });

  if (!response.ok) {
    throw new Error(`Channel send failed: ${response.status}`);
  }
}

export async function pollChannelMessages(since?: string): Promise<PollChannelMessagesResponse> {
  const searchParams = new URLSearchParams();
  if (since) {
    searchParams.set('since', since);
  }

  const response = await fetch(`/channel/messages${searchParams.toString() ? `?${searchParams.toString()}` : ''}`);
  if (!response.ok) {
    throw new Error(`Channel poll failed: ${response.status}`);
  }

  return response.json() as Promise<PollChannelMessagesResponse>;
}

export async function checkChannelHealth(): Promise<boolean> {
  try {
    const response = await fetch('/channel/health');
    return response.ok;
  } catch {
    return false;
  }
}
