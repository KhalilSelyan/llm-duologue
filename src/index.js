import ollama from "ollama";

export function converse(pA, pB, topic) {
  let history = [];
  const initialMessage = `Let's talk about ${topic}.`;

  async function* sendMessage(participant, content) {
    // Use different colors for each participant
    const color = participant.name === pA.name ? "\x1b[34m" : "\x1b[33m"; // Blue for pA, Yellow for pB
    yield `${color}\x1b[2m${participant.name}:\x1b[22m\n\n${content}\n\n\x1b[0m`;

    try {
      const model = participant.name === pA.name ? pA.model : pB.model;
      const response = await ollama.chat({
        messages: [
          { role: "user", content: content },
          { role: participant.name.toLowerCase(), content: content },
        ],
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

      history.push({
        role: participant.name,
        content: fullResponse,
      });
    } catch (error) {
      console.error(`Error sending message to ${participant.name}:`, error);
      throw error;
    }
  }

  async function* handleConversation() {
    // Start with initial message
    for await (const part of sendMessage(pA, initialMessage)) {
      yield part;
    }

    // Main conversation loop
    for (let i = 1; i < 10; i++) {
      const lastMessage = history[history.length - 1];
      const nextParticipant = lastMessage.role === pA.name ? pB : pA;

      // Get response from next participant
      for await (const part of sendMessage(
        nextParticipant,
        lastMessage.content,
      )) {
        yield part;
      }

      // On even turns, generate an additional response with full context
      if (i % 2 === 0) {
        const color =
          nextParticipant.name === pA.name ? "\x1b[34m" : "\x1b[33m";
        yield `${color}\x1b[2m${nextParticipant.name}:\x1b[22m\n\n`;

        // Build message history for context
        const messages = history.map((m) => ({
          role: m.role === nextParticipant.name ? "user" : "assistant",
          content: m.content,
        }));

        // Add system prompt if present
        if (nextParticipant.system) {
          messages.push({
            role: "system",
            content: nextParticipant.system,
          });
        }

        try {
          const response = await ollama.chat({
            model: nextParticipant.name === pA.name ? pA.model : pB.model,
            messages,
            stream: true,
          });

          let buffer = "";
          for await (const part of response) {
            const chunk = part.message.content;
            buffer += chunk;

            if (buffer.match(/[.!?]\s*$/) || buffer.length > 80) {
              yield `${color}${buffer}\x1b[0m`; // Add color to each chunk
              buffer = "";
            }
          }

          if (buffer) {
            yield `${color}${buffer}\x1b[0m\n\n`;
          }
        } catch (error) {
          console.error(`Error from ${nextParticipant.name}:`, error);
          throw error;
        }
      }
    }
  }

  return handleConversation();
}
