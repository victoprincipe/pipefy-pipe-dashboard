import { PipefySdkBridge } from '@/components/PipefySdkBridge';
import { SimpleBarChart } from '@/components/SimpleBarChart';

export default function Home() {
  return (
    <main className="flex min-h-screen w-full items-center justify-center bg-zinc-50 p-6 font-sans dark:bg-black">
      <PipefySdkBridge mode="root" />
      <SimpleBarChart />
    </main>
  );
}
