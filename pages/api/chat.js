import { NextResponse } from "next/server";
import { ChatOpenAI } from "langchain/chat_models/openai";
import { LLMChain } from "langchain/chains";
import { CallbackManager} from "langchain/callbacks";
import {
    ChatPromptTemplate,
    HumanMessagePromptTemplate,
    SystemMessagePromptTemplate
} from "langchain/prompts";
import { HumanMessage, SystemMessage} from "langchain/schema";

const OPENAI_API_KEY = process.env.API_URL;

export const config = {
    api: {
        bodyParser: false,
    },
    runtime: "edge"
};

export default async function handler(req, res) {
    const body = await req.json()

    try {
        if(!OPENAI_API_KEY){
            throw new Error("API key is invalid/not defined")
        }

        const encoder = new TextEncoder();
        const stream = new TransformStream();
        const writer = stream.writable.getWriter();

        const llm = new ChatOpenAI({
            openAIApiKey: OPENAI_API_KEY,
            temperature: 1,
            streaming: true,
            callbackManager: CallbackManager.fromHandlers({
                handleLLMNewToken: async (token) => {
                    await writer.ready;
                    await writer.write(encoder.encode(`${token}`));
                },
                handleLLMEnd: async () => {
                    await writer.ready;
                    await writer.close()
                },
                handleLLMError: async (e) => {
                    await writer.ready;
                    await writer.abort(e)
                }
            })
        });

        const chatPrompt = ChatPromptTemplate.fromPromptMessages([
            SystemMessagePromptTemplate.fromTemplate(
                "You are a helpful assistant that answers questions as best you can."
            ),
            HumanMessagePromptTemplate.fromTemplate("{input}"),
        ]);
        const chain = new LLMChain({
            prompt: chatPrompt,
            llm: llm,
        });
        chain
            .call({input: body.query})
            .catch(console.error);

        return new NextResponse(stream.readable, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-cache",
            },
        });
    } catch(error) {
        return new Response(
            JSON.stringify(
                {error: error.message},
                {
                    status: 500,
                    headers: { "Content/Type": "application/json" },
                }
            )
        )

    }
}