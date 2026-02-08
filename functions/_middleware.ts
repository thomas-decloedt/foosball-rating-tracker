// Proxy /api requests to the Workers API
// API_URL must be set in Cloudflare Pages project settings (Settings > Environment variables)
export const onRequest = async (
  context: {
    request: Request;
    next: () => Promise<Response>;
    env?: { API_URL?: string };
  },
): Promise<Response> => {
  // Log that middleware is running (for all requests to verify it's active)
  const url = new URL(context.request.url);

  // Always log for /api requests to verify middleware is running
  if (url.pathname.startsWith("/api")) {
    console.log(`[Proxy] Middleware triggered for: ${url.pathname}`);
    console.log(`[Proxy] Full URL: ${url.toString()}`);
    console.log(`[Proxy] Method: ${context.request.method}`);
  }

  // If request is for /api, proxy to Workers
  // This includes /api/v1/profile-images/* requests
  // CRITICAL: Must handle ALL /api requests, including images
  if (url.pathname.startsWith("/api")) {
    const apiUrl = context.env?.API_URL;
    if (!apiUrl) {
      return new Response(
        JSON.stringify({
          error:
            "API_URL not configured. Set API_URL in Cloudflare Pages project settings.",
        }),
        {
          status: 500,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
    // Preserve query parameters (frontend adds _v= for cache-busting)
    const workerUrl = apiUrl + url.pathname + url.search;

    // Log initial request details
    const isProfileImageRequest = url.pathname.startsWith(
      "/api/v1/profile-images/",
    );
    if (isProfileImageRequest) {
      console.log(`[Proxy] === PROFILE IMAGE REQUEST START ===`);
      console.log(`[Proxy] Request URL: ${url.pathname}`);
      console.log(`[Proxy] Request Method: ${context.request.method}`);
      console.log(`[Proxy] Worker URL: ${workerUrl}`);
      console.log(
        `[Proxy] Request Headers:`,
        Object.fromEntries(context.request.headers.entries()),
      );
    }

    try {
      // Build headers, excluding problematic ones
      const headers = new Headers();
      for (const [key, value] of context.request.headers.entries()) {
        const lowerKey = key.toLowerCase();
        // Skip headers that shouldn't be forwarded
        if (
          lowerKey !== "host" &&
          lowerKey !== "connection" &&
          lowerKey !== "cf-ray" &&
          lowerKey !== "cf-connecting-ip"
        ) {
          headers.set(key, value);
        }
      }

      if (isProfileImageRequest) {
        console.log(
          `[Proxy] Forwarding headers to Worker:`,
          Object.fromEntries(headers.entries()),
        );
      }

      // Get request body if it exists
      let body: ReadableStream | null = null;
      if (context.request.body) {
        body = context.request.body;
      }

      if (isProfileImageRequest) {
        console.log(`[Proxy] Fetching from Worker...`);
      }

      // CRITICAL: Add cache-busting headers to prevent Cloudflare from serving cached responses
      // This ensures the middleware always processes the request
      headers.set("Cache-Control", "no-cache, no-store, must-revalidate");
      headers.set("Pragma", "no-cache");
      headers.set("Expires", "0");

      const response = await fetch(workerUrl, {
        method: context.request.method,
        headers: headers,
        body: body,
        // Disable caching on the fetch itself
        cache: "no-store",
      });

      if (isProfileImageRequest) {
        console.log(
          `[Proxy] Worker Response Status: ${response.status} ${response.statusText}`,
        );
        console.log(
          `[Proxy] Worker Response Headers:`,
          Object.fromEntries(response.headers.entries()),
        );
      }

      // Check if response is binary (images, etc.) by content-type or URL path
      const contentType = response.headers.get("content-type") || "";
      const isProfileImage = url.pathname.startsWith("/api/v1/profile-images/");
      const isBinary =
        isProfileImage ||
        contentType.startsWith("image/") ||
        contentType.startsWith("video/") ||
        contentType.startsWith("audio/") ||
        contentType.startsWith("application/octet-stream");

      if (isProfileImageRequest) {
        console.log(`[Proxy] Content-Type from Worker: "${contentType}"`);
        console.log(`[Proxy] Is Binary: ${isBinary}`);
        console.log(`[Proxy] Is Profile Image: ${isProfileImage}`);
        console.log(
          `[Proxy] Content-Length: ${response.headers.get("content-length") || "not set"}`,
        );
        console.log(
          `[Proxy] Content-Encoding: ${response.headers.get("content-encoding") || "not set"}`,
        );
        console.log(
          `[Proxy] Last-Modified: ${response.headers.get("last-modified") || "not set"}`,
        );
        console.log(
          `[Proxy] ETag: ${response.headers.get("etag") || "not set"}`,
        );
        console.log(
          `[Proxy] Cache-Control: ${response.headers.get("cache-control") || "not set"}`,
        );
      }

      // Create new Headers object and copy headers explicitly
      // This ensures headers are properly preserved during proxying
      const responseHeaders = new Headers();
      for (const [key, value] of response.headers.entries()) {
        responseHeaders.set(key, value);
      }

      // CRITICAL: Always add this header to prove middleware ran
      // If this header is missing in browser, middleware didn't run
      responseHeaders.set("x-middleware-executed", "true");

      if (isProfileImageRequest) {
        console.log(
          `[Proxy] Headers copied to responseHeaders:`,
          Object.fromEntries(responseHeaders.entries()),
        );
      }

      // For binary responses, handle GIFs and other images differently
      // GIFs: Stream directly with header fixes (Last-Modified deletion, etc.)
      // Other images: Buffer (since buffering works for PNG/JPG/WebP)
      // For text responses (JSON), convert to text
      if (isBinary) {
        // Detect if this is a GIF (GIFs need special handling)
        const isGif =
          contentType === "image/gif" ||
          url.pathname.toLowerCase().endsWith(".gif");

        // Ensure Content-Type is explicitly preserved
        if (contentType) {
          // For GIFs, ensure Content-Type is exactly "image/gif" (no charset)
          if (isGif) {
            responseHeaders.set("content-type", "image/gif");
          } else {
            responseHeaders.set("content-type", contentType);
          }
        } else if (isProfileImage) {
          // Fallback: determine content-type from file extension
          const ext = url.pathname.split(".").pop()?.toLowerCase();
          const contentTypeMap: Record<string, string> = {
            gif: "image/gif",
            jpg: "image/jpeg",
            jpeg: "image/jpeg",
            png: "image/png",
            webp: "image/webp",
          };
          const fallbackContentType =
            contentTypeMap[ext || ""] || "application/octet-stream";
          responseHeaders.set("content-type", fallbackContentType);
        }

        // GIF-specific fixes: Stream directly with proper headers
        if (isGif) {
          if (isProfileImageRequest) {
            console.log(`[Proxy] === GIF DETECTED - APPLYING FIXES ===`);
            console.log(
              `[Proxy] Before header fixes:`,
              Object.fromEntries(responseHeaders.entries()),
            );
          }

          // Delete Last-Modified header (known to cause empty 200 responses in Cloudflare)
          const hadLastModified = responseHeaders.has("last-modified");
          responseHeaders.delete("last-modified");

          // Ensure Content-Type is exactly image/gif
          responseHeaders.set("content-type", "image/gif");

          // Add Cache-Control: no-transform to prevent Cloudflare compression/transformation
          // Use shorter cache with must-revalidate to allow cache-busting via query params
          responseHeaders.set(
            "cache-control",
            "no-transform, public, max-age=3600, must-revalidate",
          );

          // Remove Content-Encoding to prevent double-compression issues
          // GIFs are already compressed and shouldn't be re-compressed
          const hadContentEncoding = responseHeaders.has("content-encoding");
          responseHeaders.delete("content-encoding");

          if (isProfileImageRequest) {
            console.log(
              `[Proxy] After header fixes:`,
              Object.fromEntries(responseHeaders.entries()),
            );
            console.log(`[Proxy] Last-Modified deleted: ${hadLastModified}`);
            console.log(
              `[Proxy] Content-Encoding deleted: ${hadContentEncoding}`,
            );
            console.log(
              `[Proxy] Creating streaming Response with response.body`,
            );
            console.log(
              `[Proxy] Response.body is null: ${response.body === null}`,
            );
            console.log(
              `[Proxy] Response.body is locked: ${response.body?.locked || "N/A"}`,
            );
          }

          // Add debug header to verify middleware ran
          responseHeaders.set("x-proxy-debug", "gif-streaming-via-middleware");

          // CRITICAL: Verify response.body is available before using it
          if (!response.body) {
            console.error(`[Proxy] ERROR: response.body is null for GIF!`);
            // Fallback: buffer the response
            const arrayBuffer = await response.arrayBuffer();
            return new Response(arrayBuffer, {
              status: response.status || 200,
              statusText: response.statusText,
              headers: responseHeaders,
            });
          }

          // Stream directly - don't buffer (per Cloudflare best practices)
          const streamingResponse = new Response(response.body, {
            status: response.status || 200,
            statusText: response.statusText,
            headers: responseHeaders,
          });

          if (isProfileImageRequest) {
            console.log(
              `[Proxy] Streaming Response created - Status: ${streamingResponse.status}`,
            );
            console.log(
              `[Proxy] Streaming Response headers:`,
              Object.fromEntries(streamingResponse.headers.entries()),
            );
            console.log(`[Proxy] === GIF STREAMING RESPONSE RETURNED ===`);
          }

          return streamingResponse;
        }

        // For non-GIF images (PNG, JPG, WebP), continue using buffering
        // since buffering works correctly for these formats
        // Check Content-Length header to prevent buffering images larger than 500KB
        const contentLength = response.headers.get("content-length");
        if (contentLength) {
          const sizeBytes = parseInt(contentLength, 10);
          const maxSizeBytes = 500 * 1024; // 500KB
          if (sizeBytes > maxSizeBytes) {
            console.error(
              `[Proxy] Image too large to buffer: ${sizeBytes} bytes (max: ${maxSizeBytes} bytes)`,
            );
            return new Response("Image too large", { status: 413 });
          }
        }

        // Buffer the entire response for non-GIF images
        if (isProfileImageRequest) {
          console.log(`[Proxy] === BUFFERING NON-GIF IMAGE ===`);
          console.log(`[Proxy] Reading response.arrayBuffer()...`);
        }

        const arrayBuffer = await response.arrayBuffer();

        if (isProfileImageRequest) {
          console.log(`[Proxy] Buffer size: ${arrayBuffer.byteLength} bytes`);
          console.log(`[Proxy] Creating Response with buffered data`);
        }

        // Add debug header to verify middleware ran
        responseHeaders.set("x-proxy-debug", "buffered-via-middleware");

        const bufferedResponse = new Response(arrayBuffer, {
          status: response.status || 200,
          statusText: response.statusText,
          headers: responseHeaders,
        });

        if (isProfileImageRequest) {
          console.log(
            `[Proxy] Buffered Response created - Status: ${bufferedResponse.status}`,
          );
          console.log(
            `[Proxy] Buffered Response headers:`,
            Object.fromEntries(bufferedResponse.headers.entries()),
          );
          console.log(`[Proxy] === BUFFERED RESPONSE RETURNED ===`);
        }

        return bufferedResponse;
      } else {
        // For text responses, convert to text (JSON, etc.)
        // Add debug header to verify middleware ran
        responseHeaders.set("x-proxy-debug", "text-via-middleware");
        const responseBody = await response.text();
        return new Response(responseBody, {
          status: response.status || 200,
          statusText: response.statusText,
          headers: responseHeaders,
        });
      }
    } catch (error) {
      console.error(`[Proxy] === PROXY ERROR ===`);
      console.error(
        `[Proxy] Error type: ${error instanceof Error ? error.constructor.name : typeof error}`,
      );
      console.error(
        `[Proxy] Error message: ${error instanceof Error ? error.message : String(error)}`,
      );
      console.error(
        `[Proxy] Error stack:`,
        error instanceof Error ? error.stack : "N/A",
      );
      if (isProfileImageRequest) {
        console.error(
          `[Proxy] Error occurred while proxying profile image request`,
        );
      }
      // If fetch fails, return 502 Bad Gateway
      return new Response(
        JSON.stringify({ error: "Failed to connect to API" }),
        {
          status: 502,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  // For non-API requests (frontend pages/assets), add cache control headers
  // HTML files should never be cached, assets are handled by Vite's hash-based filenames
  const response = await context.next();

  // Get content type from response
  const contentType = response.headers.get("content-type") || "";
  const isHTML =
    contentType.includes("text/html") ||
    url.pathname === "/" ||
    url.pathname.endsWith(".html") ||
    (!url.pathname.includes(".") && !url.pathname.startsWith("/assets/"));

  // Clone response to modify headers
  const newHeaders = new Headers(response.headers);

  // Don't cache HTML files (index.html, SPA routes, etc.)
  if (isHTML) {
    newHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
    newHeaders.set("Pragma", "no-cache");
    newHeaders.set("Expires", "0");
  }
  // Assets (JS, CSS) are already cache-busted by Vite's hash-based filenames
  // Set long cache for them since filenames change on each build
  else if (
    url.pathname.startsWith("/assets/") &&
    url.pathname.match(/\.(js|css|wasm)$/)
  ) {
    newHeaders.set("Cache-Control", "public, max-age=31536000, immutable");
  }
  // Other static assets (images, fonts, etc.)
  else if (
    url.pathname.match(/\.(png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot)$/)
  ) {
    newHeaders.set("Cache-Control", "public, max-age=31536000");
  }
  // Default: don't cache unknown file types (SPA routes, etc.)
  else if (!url.pathname.startsWith("/api")) {
    newHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");
    newHeaders.set("Pragma", "no-cache");
    newHeaders.set("Expires", "0");
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: newHeaders,
  });
};
