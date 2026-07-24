// TurboModule 経由の Processing Gateway。
// macOS NativeProcessing を Application 契約へ接続するために存在する。
// RELEVANT FILES: ../../../../native/macos-adapter/RCTNativeProcessing.mm, ../../../../packages/application/src/gateway/ProcessingGateway.ts

import type { ProcessingGateway } from '@csvmapper/application';
import type {
  CellPathResult,
  FileRef,
  PickInputFileResult,
  ProcessingEvent,
  ProcessingSnapshot,
} from '@csvmapper/contracts';
import { NativeEventEmitter, NativeModules, Platform } from 'react-native';

type NativeProcessingModule = {
  pickInputFile(): Promise<PickInputFileResult>;
  inspectInput(operationId: string, file: FileRef): Promise<void>;
  preview(
    operationId: string,
    file: FileRef,
    snapshot: ProcessingSnapshot,
    rowCount: number,
  ): Promise<void>;
  inspectCellPath(
    snapshotId: string,
    rowNumber: number,
    outputItemId: string,
  ): Promise<CellPathResult>;
  cancel(operationId: string): Promise<{ accepted: boolean }>;
};

function getNativeModule(): NativeProcessingModule | null {
  if (Platform.OS !== 'macos') {
    return null;
  }
  return (
    (NativeModules.NativeProcessing as NativeProcessingModule | undefined) ??
    null
  );
}

export class NativeProcessingGateway implements ProcessingGateway {
  private readonly listeners = new Set<(event: ProcessingEvent) => void>();
  private readonly native: NativeProcessingModule | null;
  private readonly subscription: { remove(): void } | null;

  constructor() {
    this.native = getNativeModule();
    const emitter = this.native
      ? new NativeEventEmitter(NativeModules.NativeProcessing)
      : null;
    this.subscription = emitter
      ? emitter.addListener('ProcessingEvent', (event: ProcessingEvent) => {
          for (const listener of this.listeners) {
            listener(event);
          }
        })
      : null;
  }

  dispose(): void {
    this.subscription?.remove();
  }

  subscribe(listener: (event: ProcessingEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async pickInputFile(): Promise<PickInputFileResult> {
    if (!this.native) {
      return { cancelled: true };
    }
    return this.native.pickInputFile();
  }

  async inspectInput(operationId: string, file: FileRef): Promise<void> {
    if (!this.native) {
      throw new Error('NativeProcessing is unavailable');
    }
    await this.native.inspectInput(operationId, file);
  }

  async preview(
    operationId: string,
    file: FileRef,
    snapshot: ProcessingSnapshot,
    rowCount: number,
  ): Promise<void> {
    if (!this.native) {
      throw new Error('NativeProcessing is unavailable');
    }
    await this.native.preview(operationId, file, snapshot, rowCount);
  }

  async inspectCellPath(
    snapshotId: string,
    rowNumber: number,
    outputItemId: string,
  ): Promise<CellPathResult> {
    if (!this.native) {
      return { snapshotId, rowNumber, outputItemId, steps: [] };
    }
    return this.native.inspectCellPath(snapshotId, rowNumber, outputItemId);
  }

  async cancel(operationId: string): Promise<{ accepted: boolean }> {
    if (!this.native) {
      return { accepted: false };
    }
    return this.native.cancel(operationId);
  }
}
