"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerRoutes = registerRoutes;
const node_http_1 = require("node:http");
const openai_1 = __importDefault(require("openai"));
async function registerRoutes(app) {
    app.post("/api/chat", async (req, res) => {
        var _a, _b;
        try {
            const { messages, apiKey, model, provider, temperature, maxTokens } = req.body;
            if (!apiKey || typeof apiKey !== "string") {
                return res.status(400).json({ message: "API key is required" });
            }
            if (!messages || !Array.isArray(messages)) {
                return res.status(400).json({ message: "Messages array is required" });
            }
            const isDeepseek = provider === "deepseek";
            const client = new openai_1.default({
                apiKey,
                ...(isDeepseek ? { baseURL: "https://api.deepseek.com" } : {}),
            });
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache, no-transform");
            res.setHeader("X-Accel-Buffering", "no");
            res.flushHeaders();
            const selectedModel = model || (isDeepseek ? "deepseek-chat" : "gpt-4o-mini");
            const resolvedTemp = typeof temperature === "number" ? temperature : 0.7;
            const resolvedMaxTokens = typeof maxTokens === "number" && maxTokens > 0 ? maxTokens : 2048;
            const stream = await client.chat.completions.create({
                model: selectedModel,
                messages: messages.map((m) => ({
                    role: m.role,
                    content: m.content,
                })),
                stream: true,
                temperature: resolvedTemp,
                max_tokens: resolvedMaxTokens,
            });
            for await (const chunk of stream) {
                const content = ((_b = (_a = chunk.choices[0]) === null || _a === void 0 ? void 0 : _a.delta) === null || _b === void 0 ? void 0 : _b.content) || "";
                if (content) {
                    res.write(`data: ${JSON.stringify({ content })}\n\n`);
                }
            }
            res.write("data: [DONE]\n\n");
            res.end();
        }
        catch (error) {
            if (!res.headersSent) {
                const status = (error === null || error === void 0 ? void 0 : error.status) || 500;
                const message = (error === null || error === void 0 ? void 0 : error.message) || "Failed to get response from OpenAI";
                return res.status(status).json({ message });
            }
            res.write(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`);
            res.end();
        }
    });
    app.post("/api/validate-key", async (req, res) => {
        try {
            const { apiKey, provider } = req.body;
            if (!apiKey || typeof apiKey !== "string") {
                return res.status(400).json({ valid: false, message: "API key is required" });
            }
            const isDeepseek = provider === "deepseek";
            const client = new openai_1.default({
                apiKey,
                ...(isDeepseek ? { baseURL: "https://api.deepseek.com" } : {}),
            });
            await client.models.list();
            return res.json({ valid: true });
        }
        catch (error) {
            return res.json({
                valid: false,
                message: (error === null || error === void 0 ? void 0 : error.message) || "Invalid API key",
            });
        }
    });
    app.post("/api/generate-image", async (req, res) => {
        var _a;
        try {
            const { prompt, apiKey, model } = req.body;
            if (!apiKey || typeof apiKey !== "string") {
                return res.status(400).json({ message: "Replicate API key is required" });
            }
            if (!prompt || typeof prompt !== "string") {
                return res.status(400).json({ message: "Prompt is required" });
            }
            const replicateModel = model || "black-forest-labs/flux-schnell";
            const createResponse = await globalThis.fetch(`https://api.replicate.com/v1/models/${replicateModel}/predictions`, {
                method: "POST",
                headers: {
                    Authorization: `Token ${apiKey}`,
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    input: { prompt },
                }),
            });
            if (!createResponse.ok) {
                const errBody = await createResponse.json().catch(() => null);
                if (createResponse.status === 401 || createResponse.status === 403) {
                    return res.status(401).json({
                        message: "Image generation failed. Check your Replicate API key in Settings.",
                    });
                }
                const msg = (errBody === null || errBody === void 0 ? void 0 : errBody.detail) || (errBody === null || errBody === void 0 ? void 0 : errBody.title) || "Failed to generate image";
                return res.status(createResponse.status).json({ message: msg });
            }
            let prediction = await createResponse.json();
            const getUrl = (_a = prediction.urls) === null || _a === void 0 ? void 0 : _a.get;
            if (!getUrl) {
                return res.status(500).json({ message: "Failed to start image generation" });
            }
            const MAX_POLLS = 120;
            const POLL_INTERVAL = 2000;
            for (let i = 0; i < MAX_POLLS; i++) {
                if (prediction.status === "succeeded" || prediction.status === "failed" || prediction.status === "canceled") {
                    break;
                }
                await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
                const pollResponse = await globalThis.fetch(getUrl, {
                    headers: { Authorization: `Token ${apiKey}` },
                });
                if (!pollResponse.ok) {
                    if (pollResponse.status === 401 || pollResponse.status === 403) {
                        return res.status(401).json({
                            message: "Image generation failed. Check your Replicate API key in Settings.",
                        });
                    }
                    return res.status(500).json({ message: "Failed to check generation status" });
                }
                prediction = await pollResponse.json();
            }
            if (prediction.status === "failed") {
                const errMsg = prediction.error || "Image generation failed";
                return res.status(500).json({ message: errMsg });
            }
            if (prediction.status !== "succeeded") {
                return res.status(504).json({ message: "Image generation timed out" });
            }
            let imageUrl = null;
            if (prediction.output) {
                if (Array.isArray(prediction.output)) {
                    imageUrl = prediction.output[0];
                }
                else if (typeof prediction.output === "string") {
                    imageUrl = prediction.output;
                }
            }
            if (!imageUrl) {
                return res.status(500).json({ message: "No image was generated" });
            }
            return res.json({ imageUrl });
        }
        catch (error) {
            const message = (error === null || error === void 0 ? void 0 : error.message) || "Failed to generate image";
            return res.status(500).json({ message });
        }
    });
    const httpServer = (0, node_http_1.createServer)(app);
    return httpServer;
}
