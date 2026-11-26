import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { Chat, type ChatConfig } from '@/components/Chat';
import { sendMessage } from '@/lib/gemini';
import { saveMessage } from '@/lib/queries';
import { CRISIS_RESOURCES, SAFETY_PREAMBLE } from '@/lib/safety';

jest.mock('expo-symbols', () => ({ SymbolView: () => null }));
jest.mock('react-native-safe-area-context', () => {
  const { View } = require('react-native');
  return { SafeAreaView: ({ children }: { children: React.ReactNode }) => <View>{children}</View> };
});
jest.mock('@/lib/notify', () => ({ notify: jest.fn() }));
jest.mock('@/lib/gemini', () => ({ sendMessage: jest.fn(async () => 'model reply') }));
jest.mock('@/lib/queries', () => ({
  loadThread: jest.fn(async () => []),
  saveMessage: jest.fn(async () => undefined),
  clearThread: jest.fn(),
}));

const mockSend = sendMessage as jest.MockedFunction<typeof sendMessage>;

function send(config: Partial<ChatConfig>, text: string) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { gcTime: Infinity },
    },
  });
  render(
    <QueryClientProvider client={qc}>
      <Chat
        config={{ thread: 'guru', title: 'T', subtitle: 's', systemPrompt: () => 'SYS', ...config }}
      />
    </QueryClientProvider>,
  );
  return (async () => {
    fireEvent.changeText(await screen.findByPlaceholderText('Message…'), text);
    fireEvent.press(screen.getByRole('button', { name: 'Send message' }));
  })();
}

describe('Chat safety', () => {
  afterEach(() => jest.clearAllMocks());

  it('adds the safety preamble to any direct-Gemini system prompt that lacks it', async () => {
    await send({ systemPrompt: () => 'BARE PROMPT' }, 'how do I deload?');
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    expect(mockSend.mock.calls[0][0]).toBe(`BARE PROMPT${SAFETY_PREAMBLE}`);
  });

  it('does not double the preamble when the builder already includes it', async () => {
    await send({ systemPrompt: () => `BASE${SAFETY_PREAMBLE}` }, 'hi');
    await waitFor(() => expect(mockSend).toHaveBeenCalled());
    expect(mockSend.mock.calls[0][0]).toBe(`BASE${SAFETY_PREAMBLE}`);
  });

  it.each([
    ['direct Gemini', {}],
    ['RAG (ask)', { ask: jest.fn(async () => 'grounded') }],
  ])('a self-harm message never reaches the model on the %s path', async (_label, extra) => {
    const onAfterReply = jest.fn();
    await send({ ...extra, onAfterReply }, 'I want to kill myself');
    await waitFor(() =>
      expect(saveMessage).toHaveBeenCalledWith('guru', 'model', CRISIS_RESOURCES),
    );
    expect(mockSend).not.toHaveBeenCalled();
    if ('ask' in extra) expect(extra.ask).not.toHaveBeenCalled();
    expect(onAfterReply).not.toHaveBeenCalled();
  });
});
