import { FontSettingsPanel, useFontSettings } from './FontSettings';

export default function AppearanceSettingsPage() {
  const appearance = useFontSettings();

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-2xl mx-auto">
        <h1 className="mb-2 text-2xl font-bold text-gray-900 dark:text-white">外观与主题</h1>
        <p className="mb-6 text-sm text-gray-500 dark:text-gray-400">
          主题、字体和字号会保存到账号，并同步到其他设备。
        </p>
        <section className="rounded-2xl border border-gray-200 bg-white/70 p-5 shadow-sm dark:border-gray-700 dark:bg-gray-800/70">
          <FontSettingsPanel {...appearance} isOpen={true} setIsOpen={() => {}} hideButton={true} />
        </section>
      </div>
    </div>
  );
}
