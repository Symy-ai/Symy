import { NotFoundPage } from '@payloadcms/next/views';
import config from '@/payload.config';
import { importMap } from '../../importMap.js';

export default function NotFound() {
  return (
    <NotFoundPage
      config={Promise.resolve(config)}
      importMap={importMap}
      params={Promise.resolve({ segments: [] })}
      searchParams={Promise.resolve({})}
    />
  );
}
