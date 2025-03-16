import ollama from "ollama";

export function converse(pA, pB, topic, { maxTurns = 10 } = {}) {
  // Use an array of message objects to track the conversation properly
  let messages = [];
  const initialMessage = `Let's talk about ${topic}.`;

  async function* sendMessage(participant, content, isInitial = false) {
    // Use different colors for each participant
    const color = participant.name === pA.name ? "\x1b[34m" : "\x1b[33m"; // Blue for pA, Yellow for pB

    // Only display the participant's name, not the previous message
    if (!isInitial) {
      yield `${color}\x1b[2m${participant.name}:\x1b[22m\n\n\x1b[0m`;
    }

    try {
      const model = participant.name === pA.name ? pA.model : pB.model;

      // Build proper message history for context
      const ollama_messages = [];

      // Add system prompt if present
      if (participant.system) {
        ollama_messages.push({
          role: "system",
          content: participant.system,
        });
      }

      // Add conversation history for context
      if (messages.length > 0) {
        // Convert messages to proper format for the model
        for (const msg of messages) {
          // Skip system messages in the conversation history
          if (msg.role === "system") continue;

          // Determine the role for this message
          const role = msg.sender === participant.name ? "assistant" : "user";

          ollama_messages.push({
            role: role,
            content: msg.content,
          });
        }
      }

      // Add the current message as the user's query
      ollama_messages.push({
        role: "user",
        content: content,
      });

      const response = await ollama.chat({
        messages: ollama_messages,
        model: model,
        stream: true,
      });

      let buffer = "";
      let fullResponse = "";

      for await (const part of response) {
        const chunk = part.message.content;
        buffer += chunk;
        fullResponse += chunk;

        // Yield buffer when we hit a sentence end or have accumulated enough characters
        if (buffer.match(/[.!?]\s*$/) || buffer.length > 80) {
          yield `${color}${buffer}\x1b[0m`; // Add color to each chunk
          buffer = "";
        }
      }

      // Yield any remaining buffered content
      if (buffer) {
        yield `${color}${buffer}\x1b[0m\n\n`;
      }

      // Add the response to the conversation history
      messages.push({
        role: "assistant",
        sender: participant.name,
        content: fullResponse,
      });

      return fullResponse;
    } catch (error) {
      console.error(`Error sending message to ${participant.name}:`, error);
      throw error;
    }
  }

  async function* handleConversation() {
    // Add the initial topic as a system message
    messages.push({
      role: "system",
      content: initialMessage,
    });

    // Add the initial message as a user message (from the system to the first participant)
    messages.push({
      role: "user",
      sender: "system",
      content: initialMessage,
    });

    // Start with initial message from pA
    yield* sendMessage(pA, initialMessage, true);

    // Main conversation loop - limit to exchanges as specified in maxTurns
    for (let i = 1; i < maxTurns; i++) {
      // Get the last message (which should be from the previous participant)
      const lastMessage = messages[messages.length - 1];

      // Determine who speaks next
      const nextParticipant = lastMessage.sender === pA.name ? pB : pA;

      // Add the previous response as a user message to the next participant
      messages.push({
        role: "user",
        sender: lastMessage.sender,
        content: lastMessage.content,
      });

      // Get response from next participant
      for await (const part of sendMessage(
        nextParticipant,
        lastMessage.content,
      )) {
        yield part;
      }
    }
  }

  return handleConversation();
}
