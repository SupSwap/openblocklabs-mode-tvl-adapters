export const logWithTimestamp = (message: string): void => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${message}`);
  }