import { useState, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProviderConfig, CodexProviderConfig } from '../../../types/provider';
import { STORAGE_KEYS } from '../../../types/provider';
import ProviderManageSection from '../ProviderManageSection';
import CodexProviderSection from '../CodexProviderSection';
import CustomModelDialog from '../CustomModelDialog';
import { usePluginModels } from '../hooks/usePluginModels';
import styles from './style.module.less';

const BLOCK_STYLE: React.CSSProperties = { display: 'block' };
const NONE_STYLE: React.CSSProperties = { display: 'none' };
const ICON_14_STYLE: React.CSSProperties = { fontSize: 14 };
const FLEX_1_STYLE: React.CSSProperties = { flex: 1 };
const BUTTON_ROW_STYLE: React.CSSProperties = { display: 'flex', gap: 8, alignItems: 'center' };

type ProviderTab = 'claude' | 'codex' | 'agy';

interface ProviderTabSectionProps {
  currentProvider: 'claude' | 'codex' | string;
  // Claude provider props
  providers: ProviderConfig[];
  loading: boolean;
  onAddProvider: () => void;
  onEditProvider: (provider: ProviderConfig) => void;
  onDeleteProvider: (provider: ProviderConfig) => void;
  onSwitchProvider: (id: string) => void;
  // Codex provider props
  codexProviders: CodexProviderConfig[];
  codexLoading: boolean;
  onAddCodexProvider: () => void;
  onEditCodexProvider: (provider: CodexProviderConfig) => void;
  onDeleteCodexProvider: (provider: CodexProviderConfig) => void;
  onSwitchCodexProvider: (id: string) => void;
  onRevokeCodexLocalConfigAuthorization: (fallbackProviderId?: string) => void;
  // Shared
  addToast: (message: string, type: 'info' | 'success' | 'warning' | 'error') => void;
}

const ProviderTabSection = ({
  currentProvider,
  providers,
  loading,
  onAddProvider,
  onEditProvider,
  onDeleteProvider,
  onSwitchProvider,
  codexProviders,
  codexLoading,
  onAddCodexProvider,
  onEditCodexProvider,
  onDeleteCodexProvider,
  onSwitchCodexProvider,
  onRevokeCodexLocalConfigAuthorization,
  addToast,
}: ProviderTabSectionProps) => {
  const { t } = useTranslation();

  const [activeTab, setActiveTab] = useState<ProviderTab>(
    () => currentProvider === 'codex' || currentProvider === 'agy' ? currentProvider : 'claude'
  );

  // Plugin-level custom model management
  const claudeModels = usePluginModels(STORAGE_KEYS.CLAUDE_CUSTOM_MODELS);
  const codexModels = usePluginModels(STORAGE_KEYS.CODEX_CUSTOM_MODELS);
  const agyModels = usePluginModels(STORAGE_KEYS.AGY_CUSTOM_MODELS);

  // Dialog state
  const [modelDialogOpen, setModelDialogOpen] = useState(false);
  const [modelDialogAddMode, setModelDialogAddMode] = useState(false);
  // Which plugin's models the dialog is editing
  const [dialogTarget, setDialogTarget] = useState<ProviderTab>('claude');
  const [agyApiKeyInput, setAgyApiKeyInput] = useState('');
  const [agyConfig, setAgyConfig] = useState({
    hasGeminiApiKey: false,
    hasEnvironmentGeminiApiKey: false,
  });

  useEffect(() => {
    const previousUpdateAgyConfig = window.updateAgyConfig;
    window.updateAgyConfig = (jsonStr: string) => {
      try {
        const parsed = JSON.parse(jsonStr);
        setAgyConfig({
          hasGeminiApiKey: !!parsed?.hasGeminiApiKey,
          hasEnvironmentGeminiApiKey: !!parsed?.hasEnvironmentGeminiApiKey,
        });
        setAgyApiKeyInput('');
      } catch {
        setAgyConfig({ hasGeminiApiKey: false, hasEnvironmentGeminiApiKey: false });
      }
    };
    window.sendToJava?.('get_agy_config:');
    return () => {
      window.updateAgyConfig = previousUpdateAgyConfig;
    };
  }, []);

  const openModelDialog = useCallback((target: ProviderTab, addMode = false) => {
    setDialogTarget(target);
    setModelDialogAddMode(addMode);
    setModelDialogOpen(true);
  }, []);

  const closeModelDialog = useCallback(() => {
    setModelDialogOpen(false);
    setModelDialogAddMode(false);
  }, []);

  const saveAgyApiKey = useCallback(() => {
    const normalizedApiKey = agyApiKeyInput.trim();
    if (!normalizedApiKey) {
      return;
    }
    window.sendToJava?.(`set_agy_config:${JSON.stringify({ geminiApiKey: normalizedApiKey })}`);
  }, [agyApiKeyInput]);

  const clearAgyApiKey = useCallback(() => {
    setAgyApiKeyInput('');
    window.sendToJava?.('set_agy_config:{"geminiApiKey":""}');
  }, []);

  const activeModels =
    dialogTarget === 'codex' ? codexModels :
      dialogTarget === 'agy' ? agyModels :
        claudeModels;

  return (
    <div className={styles.providerTabSection}>
      <h3 className={styles.sectionTitle}>{t('settings.providers')}</h3>
      <p className={styles.sectionDesc}>{t('settings.providersDesc')}</p>

      <div className={styles.tabSelector} role="tablist" aria-label={t('settings.providers')}>
        <button
          role="tab"
          aria-selected={activeTab === 'claude'}
          aria-controls="panel-claude-providers"
          className={`${styles.tabBtn} ${activeTab === 'claude' ? styles.active : ''}`}
          onClick={() => setActiveTab('claude')}
        >
          <span className="codicon codicon-vm-connect" aria-hidden="true" />
          {t('settings.providerTab.claude')}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'codex'}
          aria-controls="panel-codex-providers"
          className={`${styles.tabBtn} ${activeTab === 'codex' ? styles.active : ''}`}
          onClick={() => setActiveTab('codex')}
        >
          <span className="codicon codicon-terminal" aria-hidden="true" />
          {t('settings.providerTab.codex')}
        </button>
        <button
          role="tab"
          aria-selected={activeTab === 'agy'}
          aria-controls="panel-agy-providers"
          className={`${styles.tabBtn} ${activeTab === 'agy' ? styles.active : ''}`}
          onClick={() => setActiveTab('agy')}
        >
          <span className="codicon codicon-terminal" aria-hidden="true" />
          {t('settings.providerTab.agy')}
        </button>
      </div>

      {/* Use display to preserve component state across tab switches */}
      <div id="panel-claude-providers" role="tabpanel" style={activeTab === 'claude' ? BLOCK_STYLE : NONE_STYLE}>
        <div
          className={styles.pluginModelsRow}
          onClick={() => openModelDialog('claude')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openModelDialog('claude'); }}
        >
          <span className="codicon codicon-symbol-misc" style={ICON_14_STYLE} />
          <span className={styles.pluginModelsLabel}>
            {t('settings.pluginModels.title')}
          </span>
          {claudeModels.models.length > 0 && (
            <span className={styles.pluginModelsBadge}>{claudeModels.models.length}</span>
          )}
          <span style={FLEX_1_STYLE} />
          <button
            className={styles.pluginModelsManageBtn}
            onClick={(e) => { e.stopPropagation(); openModelDialog('claude'); }}
          >
            {t('settings.pluginModels.manage')}
          </button>
        </div>
        <ProviderManageSection
          providers={providers}
          loading={loading}
          onAddProvider={onAddProvider}
          onEditProvider={onEditProvider}
          onDeleteProvider={onDeleteProvider}
          onSwitchProvider={onSwitchProvider}
          addToast={addToast}
          showHeader={false}
        />
      </div>

      <div id="panel-codex-providers" role="tabpanel" style={activeTab === 'codex' ? BLOCK_STYLE : NONE_STYLE}>
        <div
          className={styles.pluginModelsRow}
          onClick={() => openModelDialog('codex')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openModelDialog('codex'); }}
        >
          <span className="codicon codicon-symbol-misc" style={ICON_14_STYLE} />
          <span className={styles.pluginModelsLabel}>
            {t('settings.pluginModels.title')}
          </span>
          {codexModels.models.length > 0 && (
            <span className={styles.pluginModelsBadge}>{codexModels.models.length}</span>
          )}
          <span style={FLEX_1_STYLE} />
          <button
            className={styles.pluginModelsManageBtn}
            onClick={(e) => { e.stopPropagation(); openModelDialog('codex'); }}
          >
            {t('settings.pluginModels.manage')}
          </button>
        </div>
        <CodexProviderSection
          codexProviders={codexProviders}
          codexLoading={codexLoading}
          onAddCodexProvider={onAddCodexProvider}
          onEditCodexProvider={onEditCodexProvider}
          onDeleteCodexProvider={onDeleteCodexProvider}
          onSwitchCodexProvider={onSwitchCodexProvider}
          onRevokeCodexLocalConfigAuthorization={onRevokeCodexLocalConfigAuthorization}
          showHeader={false}
        />
      </div>

      <div id="panel-agy-providers" role="tabpanel" style={activeTab === 'agy' ? BLOCK_STYLE : NONE_STYLE}>
        <div className={styles.agyCredentialBlock}>
          <div className={styles.agyCredentialHeader}>
            <label htmlFor="agy-gemini-api-key" className={styles.agyCredentialLabel}>
              {t('settings.agy.geminiApiKey', { defaultValue: 'Gemini API key' })}
            </label>
            <span className={styles.agyCredentialStatus}>
              {agyConfig.hasGeminiApiKey || agyConfig.hasEnvironmentGeminiApiKey
                ? t('settings.agy.configured', { defaultValue: 'Configured' })
                : t('settings.agy.notConfigured', { defaultValue: 'Not configured' })}
            </span>
          </div>
          <div style={BUTTON_ROW_STYLE}>
            <input
              id="agy-gemini-api-key"
              className={styles.agyCredentialInput}
              type="password"
              value={agyApiKeyInput}
              onChange={(e) => setAgyApiKeyInput(e.target.value)}
              autoComplete="off"
              placeholder={
                agyConfig.hasGeminiApiKey
                  ? t('settings.agy.keepExistingKey', { defaultValue: 'Leave blank to keep existing key' })
                  : t('settings.agy.enterKey', { defaultValue: 'Enter Gemini API key' })
              }
            />
            <button
              className={styles.pluginModelsManageBtn}
              onClick={saveAgyApiKey}
              disabled={!agyApiKeyInput.trim()}
            >
              {t('settings.agy.saveApiKey', { defaultValue: 'Save API Key' })}
            </button>
            {(agyConfig.hasGeminiApiKey || agyApiKeyInput) && (
              <button className={styles.pluginModelsManageBtn} onClick={clearAgyApiKey}>
                {t('common.clear', { defaultValue: 'Clear' })}
              </button>
            )}
          </div>
        </div>

        <div
          className={styles.pluginModelsRow}
          onClick={() => openModelDialog('agy')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') openModelDialog('agy'); }}
        >
          <span className="codicon codicon-symbol-misc" style={ICON_14_STYLE} />
          <span className={styles.pluginModelsLabel}>
            {t('settings.pluginModels.title')}
          </span>
          {agyModels.models.length > 0 && (
            <span className={styles.pluginModelsBadge}>{agyModels.models.length}</span>
          )}
          <span style={FLEX_1_STYLE} />
          <button
            className={styles.pluginModelsManageBtn}
            onClick={(e) => { e.stopPropagation(); openModelDialog('agy'); }}
          >
            {t('settings.pluginModels.manage')}
          </button>
        </div>
      </div>

      {/* Shared model management dialog */}
      <CustomModelDialog
        isOpen={modelDialogOpen}
        models={activeModels.models}
        onModelsChange={activeModels.updateModels}
        onClose={closeModelDialog}
        initialAddMode={modelDialogAddMode}
      />
    </div>
  );
};

export default ProviderTabSection;
