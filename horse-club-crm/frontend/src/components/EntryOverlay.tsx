import { Button, ConfigProvider, Drawer, Modal, Space, theme, type ModalProps } from 'antd'

// The same form can keep its domain behavior in a modal or a dashboard drawer.
export function EntryOverlay({ variant = 'modal', ...props }: ModalProps & { variant?: 'modal' | 'drawer' }) {
  if (variant === 'modal') return <Modal {...props} />
  const cancel = () => props.onCancel?.({} as Parameters<NonNullable<ModalProps['onCancel']>>[0])
  return <ConfigProvider theme={{ algorithm: theme.darkAlgorithm, token: {
    colorText: '#FAF7F2', colorTextSecondary: '#C8BCB5', colorTextPlaceholder: '#AC9B90',
    colorBgContainer: '#2D2522', colorBgElevated: '#2D2522', colorBgLayout: '#181311',
    colorBorder: 'rgba(255,255,255,0.16)', colorBorderSecondary: 'rgba(255,255,255,0.08)',
  } }}>
    <Drawer open={props.open} title={props.title} placement="right" width={typeof props.width === 'number' || typeof props.width === 'string' ? props.width : 560}
    className={`entry-drawer ${props.className ?? ''}`} onClose={cancel} keyboard={props.keyboard} closable={props.closable === false ? false : { 'aria-label': 'Закрыть шторку' }}
    maskClosable={props.maskClosable} forceRender={props.forceRender} destroyOnHidden={props.destroyOnHidden}
    afterOpenChange={visible => { props.afterOpenChange?.(visible); if (!visible) props.afterClose?.() }}
    footer={props.footer === undefined ? <Space wrap>
      <Button {...props.cancelButtonProps} onClick={cancel}>{props.cancelText ?? 'Отмена'}</Button>
      <Button type="primary" {...props.okButtonProps} loading={props.confirmLoading}
        onClick={() => props.onOk?.({} as Parameters<NonNullable<ModalProps['onOk']>>[0])}>{props.okText ?? 'Сохранить'}</Button>
    </Space> : typeof props.footer === 'function' ? undefined : props.footer}>
    {props.children}
  </Drawer></ConfigProvider>
}
