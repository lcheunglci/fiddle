import { spawn } from 'child_process';
import * as path from 'path';

import { ipcRendererManager } from '../../src/renderer/ipc';
import {
  findModulesInEditors,
  getIsNpmInstalled,
  installModules,
  npmRun
} from '../../src/renderer/npm';
import { ForgeCommands, Runner } from '../../src/renderer/runner';
import { AppState } from '../../src/renderer/state';
import { MockChildProcess } from '../mocks/child-process';
import { ElectronFiddleMock } from '../mocks/electron-fiddle';
import { mockVersions } from '../mocks/electron-versions';

jest.mock('../../src/renderer/npm');
jest.mock('../../src/renderer/file-manager');
jest.mock('fs-extra');
jest.mock('child_process');

describe('Runner component', () => {
  let mockChild: MockChildProcess;
  let store: any;
  let instance: Runner;

  beforeEach(() => {
    mockChild = new MockChildProcess();
    ipcRendererManager.removeAllListeners();

    (getIsNpmInstalled as jest.Mock).mockReturnValue(true);

    store = {
      version: '2.0.2',
      versions: mockVersions,
      downloadVersion: jest.fn(),
      removeVersion: jest.fn(),
      pushOutput: jest.fn(),
      pushError: jest.fn(),
      binaryManager: {
        getIsDownloaded: jest.fn(() => true),
        getElectronBinaryPath: jest.fn((version: string) => `/fake/path/${version}/electron`)
      },
      getName: async () => 'test-app-name'
    };

    (window as any).ElectronFiddle = new ElectronFiddleMock();

    instance = new Runner(store as AppState);
  });

  it('runs', async () => {
    (findModulesInEditors as any).mockReturnValueOnce([ 'fake-module' ]);
    (spawn as any).mockReturnValueOnce(mockChild);

    expect(await instance.run()).toBe(true);
    expect(store.binaryManager.getIsDownloaded).toHaveBeenCalled();
    expect(window.ElectronFiddle.app.fileManager.saveToTemp).toHaveBeenCalled();
    expect(installModules).toHaveBeenCalled();
    expect(store.isRunning).toBe(true);
  });

  it('emits output', async () => {
    (findModulesInEditors as any).mockReturnValueOnce([ 'fake-module' ]);
    (spawn as any).mockReturnValueOnce(mockChild);

    // Output
    expect(await instance.run()).toBe(true);
    mockChild.stdout.emit('data', 'hi');
    mockChild.stderr.emit('data', 'hi');
    expect(store.pushOutput).toHaveBeenCalledTimes(7);

    // Stop
    mockChild.emit('close', 0);
    expect(store.isRunning).toBe(false);
  });

  it('stops on close', async () => {
    (findModulesInEditors as any).mockReturnValueOnce([ 'fake-module' ]);
    (spawn as any).mockReturnValueOnce(mockChild);

    // Stop
    expect(await instance.run()).toBe(true);
    expect(store.isRunning).toBe(true);
    instance.stop();
    expect(store.isRunning).toBe(false);
  });

  it('stops on stop()', async () => {
    (findModulesInEditors as any).mockReturnValueOnce([ 'fake-module' ]);
    (spawn as any).mockReturnValueOnce(mockChild);

    // Stop
    expect(await instance.run()).toBe(true);
    mockChild.emit('close', 0);
    expect(store.isRunning).toBe(false);
  });

  it('cleans the app data dir after a run', async (done) => {
    (spawn as any).mockReturnValueOnce(mockChild);
    expect(await instance.run()).toBe(true);
    mockChild.emit('close', 0);

    process.nextTick(() => {
      expect(window.ElectronFiddle.app.fileManager.cleanup)
      .toHaveBeenCalledTimes(2);
      expect(window.ElectronFiddle.app.fileManager.cleanup)
        .toHaveBeenLastCalledWith(path.join(`/test-path/test-app-name`));
      done();
    });
  });

  it('does not run version not yet downloaded', async () => {
    store.binaryManager.getIsDownloaded.mockReturnValueOnce(false);

    expect(await instance.run()).toBe(false);
  });

  it('does not run if writing files fails', async () => {
    (window.ElectronFiddle.app.fileManager.saveToTemp as jest.Mock)
      .mockImplementationOnce(() => {
        throw new Error('bwap bwap');
      });

    expect(await instance.run()).toBe(false);
  });

  it('installs modules on installModules()', async () => {
    expect(await instance.npmInstall('')).toBe(true);
    expect(installModules).toHaveBeenCalled();
  });

  it('handles an error in installModules()', async () => {
    (installModules as jest.Mock).mockImplementationOnce(() => {
      throw new Error('bwap bwap');
    });

    expect(await instance.npmInstall('')).toBe(false);
    expect(installModules).toHaveBeenCalled();
  });

  it('performs a package operation in performForgeOperation()', async () => {
    expect(await instance.performForgeOperation(ForgeCommands.PACKAGE)).toBe(true);
  });

  it('performs a make operation in performForgeOperation()', async () => {
    expect(await instance.performForgeOperation(ForgeCommands.MAKE)).toBe(true);
  });

  it('handles an error in saveToTemp() in performForgeOperation()', async () => {
    (instance as any).saveToTemp = jest.fn();

    expect(await instance.performForgeOperation(ForgeCommands.MAKE)).toBe(false);
  });

  it('handles an error in npmInstall() in performForgeOperation()', async () => {
    (installModules as jest.Mock).mockImplementationOnce(() => {
      throw new Error('bwap bwap');
    });

    expect(await instance.performForgeOperation(ForgeCommands.MAKE)).toBe(false);
  });

  it('handles an error in npmRun() in performForgeOperation()', async () => {
    (npmRun as jest.Mock).mockImplementationOnce(() => {
      throw new Error('bwap bwap');
    });

    expect(await instance.performForgeOperation(ForgeCommands.MAKE)).toBe(false);
  });

  it('does attempt a forge operation if npm is not installed', async () => {
    (getIsNpmInstalled as jest.Mock).mockReturnValueOnce(false);

    expect(await instance.performForgeOperation(ForgeCommands.MAKE)).toBe(false);
  });

  describe('installModulesForEditor()', () => {
    it('does not attempt installation if npm is not installed', async () => {
      (getIsNpmInstalled as jest.Mock).mockReturnValueOnce(false);
      (findModulesInEditors as jest.Mock).mockReturnValueOnce([ 'fake-module' ]);

      await instance.installModulesForEditor({
        html: '',
        main: `const a = require('say')`,
        renderer: ''
      }, '/fake/path');

      expect(installModules).toHaveBeenCalledTimes(0);
    });

    it('does attempt installation if npm is installed', async () => {
      (getIsNpmInstalled as jest.Mock).mockReturnValueOnce(true);
      (findModulesInEditors as jest.Mock).mockReturnValueOnce([ 'fake-module' ]);

      await instance.installModulesForEditor({
        html: '',
        main: `const a = require('say')`,
        renderer: ''
      }, '/fake/path');

      expect(installModules).toHaveBeenCalledTimes(1);
    });
  });
});