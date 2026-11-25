import { createServer } from "node:http";

const port = Number(process.env.AI_E2E_SERVER_PORT ?? 4318);

const server = createServer((request, response) => {
  if (request.method === "GET" && request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }
  if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
    return;
  }

  let raw = "";
  request.setEncoding("utf8");
  request.on("data", (chunk) => {
    raw += chunk;
  });
  request.on("end", () => {
    try {
      const body = JSON.parse(raw) as {
        messages: Array<{ content: string }>;
      };
      const prompt = JSON.parse(body.messages[1]!.content) as {
        transactions: Array<{ itemRef: string }>;
        categories: Array<{ id: string; name: string }>;
      };
      const food = prompt.categories.find((category) => category.name === "Food");
      const results = prompt.transactions.map((transaction) => ({
        itemRef: transaction.itemRef,
        categoryId: food?.id ?? null,
        confidence: 0.99,
        ambiguous: false,
        reason: "E2E Test service",
      }));
      response.writeHead(200, { "content-type": "application/json" });
      response.end(
        JSON.stringify({
          choices: [
            {
              message: {
                role: "assistant",
                content: JSON.stringify({ results }),
              },
            },
          ],
        }),
      );
    } catch {
      response.writeHead(400, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: "invalid request" }));
    }
  });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`AI categorization E2E server listening on ${port}.`);
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
