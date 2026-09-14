/* eslint-disable @typescript-eslint/no-explicit-any */
import { RootLayout, handleServerFunctions } from '@payloadcms/next/layouts';
import { importMap } from './importMap.js';
import React from 'react';
import config from '@/payload.config';

import '@/styles/payload-custom.scss';

type Props = {
  children: React.ReactNode;
};

export default function Layout({ children }: Props) {
  return (
    <RootLayout
      config={Promise.resolve(config)}
      importMap={importMap}
      serverFunction={handleServerFunctions as any}
    >
      {children}
    </RootLayout>
  );
}
