export async function fetchRenderedPage() {
  return {
    supported: false,
    findings: [
      {
        id: 'browser-rendering-unavailable',
        status: 'N/A',
        details: 'Browser rendering adapter is not configured in the local Node runtime.',
      },
    ],
  };
}
