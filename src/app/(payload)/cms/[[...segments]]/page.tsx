import { RootPage } from '@payloadcms/next/views';
import config from '@/payload.config';
import { importMap } from '../../importMap.js';

export default function Page(props: {
  params: Promise<{ segments: string[] }>;
  searchParams: Promise<{ [key: string]: string | string[] }>;
}) {
  return (
    <RootPage
      config={Promise.resolve(config)}
      importMap={importMap}
      params={props.params}
      searchParams={props.searchParams}
    />
  );
}
