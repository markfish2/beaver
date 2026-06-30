import { ChevronRight } from 'lucide-react';
import { useState, useEffect } from 'react';

interface BreadcrumbsProps {
  items: { id: string; title: string }[];
  onNavigate: (id: string) => void;
}

const Breadcrumbs = ({ items, onNavigate }: BreadcrumbsProps) => {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const truncateTitle = (title: string) => {
    if (isMobile && title.length > 3) {
      return title.slice(0, 3) + '...';
    }
    return title;
  };

  return (
    <nav className="flex items-center text-sm text-gray-500 px-4 py-2">
      {items.map((item, index) => (
        <div key={item.id} className="flex items-center">
          {index > 0 && <ChevronRight className="w-4 h-4 mx-1 text-gray-400" />}
          {index === 0 ? (
            <button
              onClick={() => onNavigate(item.id)}
              className="px-2.5 py-0.5 bg-[#E6E6D5] text-gray-700 text-xs font-medium rounded-full hover:bg-[#D8D8C8] transition-colors"
              title={item.title}
            >
              {truncateTitle(item.title)}
            </button>
          ) : (
            <button
              onClick={() => onNavigate(item.id)}
              className={`hover:text-blue-600 hover:underline transition-colors ${
                index === items.length - 1 ? 'font-semibold text-gray-900 dark:text-gray-100' : ''
              }`}
              title={item.title}
            >
              {truncateTitle(item.title)}
            </button>
          )}
        </div>
      ))}
    </nav>
  );
};

export default Breadcrumbs;
