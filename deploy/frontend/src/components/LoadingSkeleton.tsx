const LoadingSkeleton = () => {
  return (
    <div className="flex-1 px-8 py-8 bg-white dark:bg-gray-900">
      <div className="max-w-[900px] mx-auto">
        <div className="h-12 w-3/4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse mb-8" />
        
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="mb-4 ml-0">
            <div className="flex items-start group">
              <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse mr-3 mt-2" />
              <div className="flex-1">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-full mb-2" style={{ animationDelay: `${i * 100}ms` }} />
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-2/3" style={{ animationDelay: `${i * 100 + 50}ms` }} />
              </div>
            </div>
            
            {i % 2 === 0 && (
              <div className="ml-8 mt-2">
                <div className="flex items-start group">
                  <div className="w-1.5 h-1.5 rounded-full bg-gray-300 dark:bg-gray-600 animate-pulse mr-3 mt-2" />
                  <div className="flex-1">
                    <div className="h-5 bg-gray-200 dark:bg-gray-700 rounded animate-pulse w-5/6" style={{ animationDelay: `${i * 100 + 100}ms` }} />
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};

export default LoadingSkeleton;
