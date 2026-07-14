const text = `{ "answer": "### Core Concept\\n- RAG (Retrieval-Augmented Generation) is an architecture that enhances LLM outputs by grounding them in external knowledge retrieved at inference time.\\n- Instead of relying solely on the model's parametric memory (weights), RAG retrieves relevant documents from a knowledge base and conditions generation on both the query and the retrieved context.\\n- This dramatically reduces hallucinations, enables knowledge updates without retraining, and provides citations for generated claims.\\n\\n### How It Works\\n- Step 1 – Query Encoding: Convert the user query into an embedding vector using an embedding model (e.g., text-embedding-3-small).\\n- Step 2 – Retrieval: Search a vector database (e.g., Pinecone, Weaviate, Chroma) for the top-K most similar document chunks using cosine similarity or dot product.\\n- Step 3 – Prompt Construction: Build a prompt that includes the retrieved context (e.g., \\"Context: ... \\n\\n Question: ...\\").\\n- Step 4 – Generation: The LLM generates an answer conditioned on the enriched prompt, grounding its response in the retrieved evidence.\\n\\n### My Experience with RAG\\n- At RagaAI, I built AI agents that integrated RAG pipelines for healthcare applications. For example, I developed a STT agent that transcribed doctor-patient conversations and then used RAG to retrieve relevant clinical guidelines or patient history from a vector database before generating summaries.\\n- I also implemented RAG pipelines for multi-step task automation, combining LLM-powered reasoning with retrieval from medical knowledge bases to ensure factual accuracy.\\n\\n### Key Components\\n- Chunking Strategy: Split documents into overlapping chunks (e.g., 512 tokens with 50-token overlap) to preserve context.\\n- Embedding Model: Use a model like all-MiniLM-L6-v2 or text-embedding-ada-002 for semantic search.\\n- Vector Database: Stores embeddings and supports efficient nearest-neighbor search (e.g., HNSW index).\\n- Retrieval Strategy: Options include dense retrieval (embedding-based), sparse retrieval (BM25), or hybrid (combining both).\\n\\n### Example Code\\npython\\nfrom langchain.embeddings import OpenAIEmbeddings\\nfrom langchain.vectorstores import Chroma\\nfrom langchain.chains import RetrievalQA\\nfrom langchain.llms import OpenAI\\n\\n# Load documents and split into chunks\\nfrom langchain.document_loaders import TextLoader\\nfrom langchain.text_splitter import RecursiveCharacterTextSplitter\\n\\nloader = TextLoader('knowledge_base.txt')\\ndocuments = loader.load()\\ntext_splitter = RecursiveCharacterTextSplitter(chunk_size=512, chunk_overlap=50)\\ndocs = text_splitter.split_documents(documents)\\n\\n# Create vector store\\nembeddings = OpenAIEmbeddings()\\nvectorstore = Chroma.from_documents(docs, embeddings)\\n\\n# Create RAG chain\\nqa_chain = RetrievalQA.from_chain_type(\\n llm=OpenAI(),\\n chain_type=\\"stuff\\", # or \\"map_reduce\\", \\"refine\\"\\n retriever=vectorstore.as_retriever(search_kwargs={\\"k\\": 3})\\n)\\n\\n# Query\\nresponse = qa_chain.run(\\"What are the side effects of this medication?\\")\\nprint(response)\\n\\n\\n### Practical Hints\\n- Chunk size matters: Too small chunks lose context; too large chunks dilute relevance. Start with 512 tokens and 10-20% overlap.\\n- Hybrid search: Combine dense embeddings with BM25 for better recall on exact matches.\\n- Evaluation: Use metrics like Hit Rate, MRR, and Faithfulness to measure retrieval and generation quality.\\n- Latency: Retrieval adds 100-500ms. Cache frequent queries or use approximate nearest neighbor (ANN) indexes.", "bulletPoints": [ "RAG grounds LLM outputs in external knowledge retrieved at inference time, reducing hallucinations.", "Pipeline: query encoding → vector DB search → prompt construction → generation.", "Key components: chunking, embedding model, vector database, retrieval strategy.", "My experience: built RAG pipelines for healthcare STT agents and multi-step task automation at RagaAI." ], "hints": [ "RAG", "Retrieval-Augmented Generation", "Vector database", "Chunking", "Embedding", "Hallucination mitigation" ] }`;

function parsePlatformAnswer(text) {
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        answer: parsed.answer || '',
        bulletPoints: Array.isArray(parsed.bulletPoints) ? parsed.bulletPoints : [],
        hints: Array.isArray(parsed.hints) ? parsed.hints : [],
      };
    } catch (e) {
      console.log('JSON parse failed:', e.message);
      const extractField = (fieldName) => {
        const regex = new RegExp(`"\\$\\{fieldName\\}"\\\\s*:\\\\s*"([\\\\s\\\\S]*?)"(?=\\\\s*(?:,\\\\s*"[a-zA-Z]+"|\\\\}$))`);
        const match = text.match(regex);
        return match ? match[1].replace(/\\\\n/g, '\\n').replace(/\\\\"/g, '"') : '';
      };
      
      const extractArray = (fieldName) => {
        const regex = new RegExp(`"\\$\\{fieldName\\}"\\\\s*:\\\\s*\\\\[([\\\\s\\\\S]*?)\\\\]`);
        const match = text.match(regex);
        if (!match) return [];
        return match[1].split('","').map(s => s.replace(/^"|"$/g, '').trim()).filter(Boolean);
      };

      return {
        answer: extractField('answer'),
        bulletPoints: extractArray('bulletPoints'),
        hints: extractArray('hints'),
      };
    }
  }

  return { answer: text.trim() };
}

const parsed = parsePlatformAnswer(text);
console.log('Answer length:', parsed.answer.length);
console.log('Bullet Points count:', parsed.bulletPoints.length);
console.log('Hints count:', parsed.hints.length);
