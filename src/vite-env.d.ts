/* eslint-disable @typescript-eslint/naming-convention */
/// <reference types="vite/client" />

declare module "*.svg" {
  export const ReactComponent: React.FunctionComponent<
    React.ComponentProps<"svg"> & { title?: string }
  >;
}
