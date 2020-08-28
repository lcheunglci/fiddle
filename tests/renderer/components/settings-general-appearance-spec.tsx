import { IItemRendererProps } from '@blueprintjs/select';
import { shell } from 'electron';
import { shallow } from 'enzyme';
import * as React from 'react';

import {
  AppearanceSettings,
  filterItem,
  renderItem,
  ThemeSelect,
} from '../../../src/renderer/components/settings-general-appearance';
import { getAvailableThemes } from '../../../src/renderer/themes';
import {
  FiddleTheme,
  LoadedFiddleTheme,
  defaultDark,
  defaultLight,
} from '../../../src/renderer/themes-defaults';
import { when } from 'mobx';
import { ipcRendererManager } from '../../../src/renderer/ipc';
import { IpcEvents } from '../../../src/ipc-events';

const mockThemes = [
  {
    name: 'defaultDark',
    file: 'defaultDark',
  },
];

jest.mock('fs-extra');
jest.mock('../../../src/utils/import', () => ({
  fancyImport: async (p: string) => require(p),
}));

jest.mock('../../../src/renderer/themes', () => ({
  THEMES_PATH: '~/.electron-fiddle/themes',
  getAvailableThemes: jest.fn(),
  getTheme: () => Promise.resolve(defaultDark),
}));

describe('AppearanceSettings component', () => {
  let store: any;

  beforeEach(() => {
    store = {
      setTheme: jest.fn(),
    };

    (getAvailableThemes as jest.Mock).mockResolvedValue(mockThemes);
  });

  it('renders', () => {
    const wrapper = shallow(<AppearanceSettings appState={store} />);

    expect(wrapper).toMatchSnapshot();
  });

  it('renders the correct selected theme', (done) => {
    store.theme = 'defaultDark';
    const wrapper = shallow(<AppearanceSettings appState={store} />);

    when(
      () => (wrapper.state() as any)?.selectedTheme?.name === 'defaultDark',
      () => done(),
    );
  });

  it('handles a theme change', () => {
    const wrapper = shallow(<AppearanceSettings appState={store} />);
    const instance: AppearanceSettings = wrapper.instance() as any;
    instance.handleChange({ file: 'defaultLight' } as any);

    expect(store.setTheme).toHaveBeenCalledWith('defaultLight');
  });

  it('disables Theme Select if using System Theme', () => {
    store.isUsingSystemTheme = true;

    const wrapper = shallow(<AppearanceSettings appState={store} />);
    const themeSelect = wrapper.find(ThemeSelect);
    expect(themeSelect).toMatchSnapshot();

    store.isUsingSystemTheme = false;
  });

  it('updates theme in selector when app state changes', (done) => {
    const wrapper = shallow(<AppearanceSettings appState={store} />);
    store.theme = defaultDark.name;
    when(
      () => {
        const theme: LoadedFiddleTheme = wrapper.state('selectedTheme');
        return theme?.name === defaultDark.name;
      },
      () => done(),
    );
  });

  describe('openThemeFolder()', () => {
    it('attempts to open the folder', async () => {
      const wrapper = shallow(<AppearanceSettings appState={store} />);
      const instance: AppearanceSettings = wrapper.instance() as any;
      await instance.openThemeFolder();

      expect(shell.showItemInFolder).toHaveBeenCalled();
    });

    it('handles an error', async () => {
      const wrapper = shallow(<AppearanceSettings appState={store} />);
      const instance: AppearanceSettings = wrapper.instance() as any;
      (shell as any).showItemInFolder.mockImplementationOnce(() => {
        throw new Error('Bwap');
      });

      expect(await instance.openThemeFolder()).toBe(false);
    });
  });

  describe('createNewThemeFromCurrent()', () => {
    it('creates a new file from the current theme', async () => {
      const fs = require('fs-extra');
      const wrapper = shallow(<AppearanceSettings appState={store} />);
      const instance: AppearanceSettings = wrapper.instance() as any;
      await instance.createNewThemeFromCurrent();

      expect(shell.showItemInFolder).toHaveBeenCalled();
      expect(fs.outputJSON).toHaveBeenCalled();

      const args = fs.outputJSON.mock.calls[0];
      expect(args[0].includes(`.electron-fiddle`)).toBe(true);
      expect(args[1].name).toBeDefined();
      expect(args[1].name === 'defaultDark').toBe(false);
      expect(args[1].common).toBeDefined();
      expect(args[1].file).toBeUndefined();
    });

    it('adds the newly created theme to the Themes dropdown', async () => {
      const fs = require('fs-extra');
      const arr: Array<FiddleTheme> = [];
      (getAvailableThemes as jest.Mock).mockResolvedValue(arr);
      (fs.outputJSON as jest.Mock).mockImplementation(
        (_, theme: FiddleTheme) => {
          arr.push(theme);
        },
      );
      const wrapper = shallow(<AppearanceSettings appState={store} />);
      expect(wrapper.state('themes')).toHaveLength(0);
      const instance: AppearanceSettings = wrapper.instance() as any;
      await instance.createNewThemeFromCurrent();
      expect(wrapper.state('themes')).toHaveLength(1);
    });

    it('handles an error', async () => {
      const wrapper = shallow(<AppearanceSettings appState={store} />);
      const instance: AppearanceSettings = wrapper.instance() as any;
      (shell as any).showItemInFolder.mockImplementationOnce(() => {
        throw new Error('Bwap');
      });

      const result = await instance.createNewThemeFromCurrent();
      expect(result).toBe(false);
    });
  });

  describe('filterItem()', () => {
    it('filters', () => {
      const foo = filterItem('foo', { name: 'foo' } as any);
      expect(foo).toBe(true);

      const bar = filterItem('foo', { name: 'bar' } as any);
      expect(bar).toBe(false);
    });
  });

  describe('renderItem()', () => {
    const mockItemProps: IItemRendererProps = {
      handleClick: () => ({}),
      index: 0,
      modifiers: {
        active: false,
        disabled: false,
        matchesPredicate: true,
      },
      query: '',
    };

    it('returns null for non-matching', () => {
      const result = renderItem({ name: 'foo' } as any, {
        ...mockItemProps,
        modifiers: {
          ...mockItemProps.modifiers,
          matchesPredicate: false,
        },
      });

      expect(result).toBe(null);
    });

    it('returns a MenuItem for matching', () => {
      const result = renderItem({ name: 'foo' } as any, {
        ...mockItemProps,
      });

      expect(result).toMatchSnapshot();
    });
  });

  describe('handleThemeSource()', () => {
    beforeEach(() => {
      ipcRendererManager.send = jest.fn();
    });

    it('sets system theme source if checked', () => {
      const wrapper = shallow(<AppearanceSettings appState={store} />);
      const instance: AppearanceSettings = wrapper.instance() as any;
      instance.handleThemeSource({ currentTarget: { checked: true } } as any);
      expect(ipcRendererManager.send).toHaveBeenCalledWith(
        IpcEvents.SET_THEME_SOURCE,
        'system',
      );
      expect(store.isUsingSystemTheme).toBe(true);
    });

    it('sets theme source to dark if unchecking while dark theme', () => {
      const wrapper = shallow(<AppearanceSettings appState={store} />);
      const instance: AppearanceSettings = wrapper.instance() as any;
      instance.setState({ selectedTheme: defaultDark });
      instance.handleThemeSource({ currentTarget: { checked: false } } as any);
      expect(ipcRendererManager.send).toHaveBeenCalledWith(
        IpcEvents.SET_THEME_SOURCE,
        'dark',
      );
      expect(store.isUsingSystemTheme).toBe(false);
    });

    it('sets theme source to light if unchecking while light theme', () => {
      const wrapper = shallow(<AppearanceSettings appState={store} />);
      const instance: AppearanceSettings = wrapper.instance() as any;
      instance.setState({ selectedTheme: defaultLight });
      instance.handleThemeSource({ currentTarget: { checked: false } } as any);
      expect(ipcRendererManager.send).toHaveBeenCalledWith(
        IpcEvents.SET_THEME_SOURCE,
        'light',
      );
      expect(store.isUsingSystemTheme).toBe(false);
    });
  });
});
