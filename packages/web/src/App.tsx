import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter } from "react-router-dom";

const queryClient = new QueryClient();

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <div className="min-h-screen bg-background text-foreground">
          <h1 className="text-2xl font-bold p-8">Spendoza</h1>
        </div>
      </BrowserRouter>
    </QueryClientProvider>
  );
}

export default App;
