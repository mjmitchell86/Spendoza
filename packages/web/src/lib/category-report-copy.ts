// Request init for POST /reports/generate: a single month sends it as the body, anything else sends none.
export function generateReportRequest(month?: string): RequestInit {
  return month ? { method: "POST", body: JSON.stringify({ month }) } : { method: "POST" };
}

// Body of the Categories delete dialog.
export function categoryDeleteMessage(name: string): string {
  return `Are you sure you want to delete “${name}”? Its transactions become uncategorized and its bills move to Other.`;
}
