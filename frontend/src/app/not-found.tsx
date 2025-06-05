export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 text-white">
      <h1 className="text-4xl font-bold mb-4">404</h1>
      <h2 className="text-xl mb-4">Page Not Found</h2>
      <p className="text-gray-400 mb-8">The page you are looking for does not exist.</p>
      <a 
        href="/" 
        className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-md transition-colors"
      >
        Go Home
      </a>
    </div>
  );
} 