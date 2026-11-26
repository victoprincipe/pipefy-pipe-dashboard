import { PipefySdkBridge } from '@/components/PipefySdkBridge';
import { SimpleBarChart } from '@/components/SimpleBarChart';

export default function Home() {
  return (
    <main className="flex h-screen w-full items-center justify-center overflow-y-auto bg-zinc-50 p-6 font-sans dark:bg-black">
      <PipefySdkBridge />
      <SimpleBarChart />
    </main>
  );
}
