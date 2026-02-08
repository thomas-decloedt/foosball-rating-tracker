// Cloudflare Pages + Workers on same domain - use relative paths
export async function fetchApi<T>(
  url: string,
  options?: RequestInit,
): Promise<T> {
  try {
    // Add timeout to prevent hanging (20 seconds)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...options?.headers,
      },
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      let errorMessage = "Unknown error";
      let errorData: any = null;
      let responseText = "";

      try {
        responseText = await response.text();
        // Try to parse as JSON
        try {
          errorData = JSON.parse(responseText);
          errorMessage =
            errorData.error?.message ??
            errorData.error?.details ??
            errorData.message ??
            `HTTP ${response.status}: ${response.statusText}`;
        } catch {
          // Not JSON, use text
          errorMessage =
            responseText || `HTTP ${response.status}: ${response.statusText}`;
        }
      } catch {
        errorMessage = `HTTP ${response.status}: ${response.statusText}`;
      }

      // Log full error for debugging
      console.error("API Error:", {
        url,
        status: response.status,
        statusText: response.statusText,
        errorData,
        responseText,
      });

      const error = new Error(errorMessage);
      (error as any).status = response.status;
      (error as any).data = errorData;
      (error as any).responseText = responseText;
      throw error;
    }

    return response.json();
  } catch (err) {
    // Handle abort/timeout errors
    if (err instanceof Error && err.name === "AbortError") {
      throw new Error(
        "Request timeout: The server took too long to respond. Please try again.",
      );
    }
    // Handle network errors
    if (err instanceof TypeError && err.message.includes("fetch")) {
      throw new Error(
        "Network error: Unable to connect to server. Please check your connection.",
      );
    }
    throw err;
  }
}
