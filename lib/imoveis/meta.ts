import { graphBaseUrl } from "@/lib/channels/meta/graph-base";

function graphBase(): string {
  return graphBaseUrl();
}

export class PermanentMetaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PermanentMetaError";
  }
}

type MetaResponse = Record<string, unknown>;

async function metaRequest(path: string, token: string, options: RequestInit = {}): Promise<MetaResponse> {
  const response = await fetch(`${graphBase()}/${path.replace(/^\//, "")}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers ?? {}),
    },
  });

  const text = await response.text();
  let data: MetaResponse = {};
  try { data = text ? (JSON.parse(text) as MetaResponse) : {}; } catch { data = { raw: text }; }

  if (!response.ok) {
    const errorMessage =
      typeof data.error === "object" && data.error && "message" in data.error
        ? String((data.error as { message?: unknown }).message ?? "Meta API error")
        : "Meta API error";
    if (response.status >= 400 && response.status < 500 && ![408, 429].includes(response.status)) {
      throw new PermanentMetaError(errorMessage);
    }
    throw new Error(errorMessage);
  }
  return data;
}

function postParams(params: Record<string, string>): RequestInit {
  return {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params).toString(),
  };
}

export type MetaPublishInput = {
  platform: "instagram" | "facebook";
  externalAccountId: string;
  accessToken: string;
  imageUrl: string;
  caption: string;
  altText: string;
  providerMediaContainerId?: string | null;
};

export type MetaPublishResult = {
  externalPublicationId: string;
  providerMediaContainerId: string | null;
  permalink: string | null;
};

async function publishInstagram(input: MetaPublishInput): Promise<MetaPublishResult> {
  if (!input.imageUrl.startsWith("https://")) {
    throw new PermanentMetaError("A imagem precisa ser uma URL HTTPS pública.");
  }

  let containerId = input.providerMediaContainerId ?? null;
  if (!containerId) {
    const container = await metaRequest(
      `/${input.externalAccountId}/media`,
      input.accessToken,
      postParams({
        image_url: input.imageUrl,
        caption: input.caption,
        ...(input.altText ? { alt_text: input.altText } : {}),
      }),
    );
    if (typeof container.id !== "string") throw new Error("Meta não devolveu o ID do container.");
    containerId = container.id;
  }

  for (let attempt = 0; attempt < 6; attempt += 1) {
    const status = await metaRequest(`/${containerId}?fields=status_code`, input.accessToken);
    const code = typeof status.status_code === "string" ? status.status_code : "";
    if (code === "FINISHED") break;
    if (code === "ERROR" || code === "EXPIRED") {
      throw new PermanentMetaError(`Container do Instagram terminou com estado ${code}.`);
    }
    if (attempt === 5) throw new Error("Container do Instagram ainda não está pronto.");
    await new Promise((resolve) => setTimeout(resolve, 2_000));
  }

  const published = await metaRequest(
    `/${input.externalAccountId}/media_publish`,
    input.accessToken,
    postParams({ creation_id: containerId }),
  );
  if (typeof published.id !== "string") throw new Error("Meta não devolveu o ID da publicação.");

  let permalink: string | null = null;
  try {
    const media = await metaRequest(`/${published.id}?fields=permalink`, input.accessToken);
    if (typeof media.permalink === "string") permalink = media.permalink;
  } catch {}
  return {
    externalPublicationId: published.id,
    providerMediaContainerId: containerId,
    permalink,
  };
}

async function publishFacebook(input: MetaPublishInput): Promise<MetaPublishResult> {
  if (!input.imageUrl.startsWith("https://")) {
    throw new PermanentMetaError("A imagem precisa ser uma URL HTTPS pública.");
  }
  const published = await metaRequest(
    `/${input.externalAccountId}/photos`,
    input.accessToken,
    postParams({ url: input.imageUrl, caption: input.caption, published: "true" }),
  );
  if (typeof published.id !== "string") throw new Error("Meta não devolveu o ID da publicação.");
  return { externalPublicationId: published.id, providerMediaContainerId: null, permalink: null };
}

export async function publishToMeta(input: MetaPublishInput): Promise<MetaPublishResult> {
  return input.platform === "instagram"
    ? publishInstagram(input)
    : publishFacebook(input);
}
