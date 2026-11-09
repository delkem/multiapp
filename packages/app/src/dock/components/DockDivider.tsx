import * as React from 'react';
import { createPortal } from 'react-dom';
import * as remote from '@electron/remote';
import { DragSource, DropTarget } from 'react-dnd';
import { getEmptyImage } from 'react-dnd-html5-backend';
// @ts-ignore: no declaration file
import injectSheet from 'react-jss';
import { MAX_DIVIDER_LABEL_LENGTH } from '../dividers';
import { dockAppTarget } from './DraggableAppDockIcon';

interface Classes {
  container: string,
  line: string,
  label: string,
  editor: string,
}

export interface DividerVisualProps {
  classes?: Classes,
  label: string,
}

interface OwnProps {
  /** raw dock entry, used as the drag item id */
  item: string,
  dividerId: string,
  label: string,
  /** position in the raw dock list */
  index: number,
  moveIcon: (item: string, hoverIndex: number) => any,
  onRename: (dividerId: string, label: string) => any,
  onRemove: (dividerId: string) => any,
  onAddDividerBelow: (afterItem: string) => any,
}

interface DndProps {
  connectDropTarget: (el: any) => any,
  connectDragSource: (el: any) => any,
  connectDragPreview: (el: any) => any,
  isDragging: boolean,
}

type Props = OwnProps & DndProps & { classes?: Classes };

interface State {
  editing: boolean,
  draft: string,
  editorPosition: { top: number, left: number } | null,
}

const styles = {
  container: {
    width: 50,
    padding: '10px 6px 2px',
    boxSizing: 'border-box',
    cursor: 'grab',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
  },
  line: {
    width: '100%',
    height: 1,
    borderRadius: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
  },
  label: {
    marginTop: 4,
    maxWidth: '100%',
    fontSize: 8,
    lineHeight: '10px',
    fontWeight: 600,
    letterSpacing: 0.4,
    textTransform: 'uppercase',
    color: 'rgba(255, 255, 255, 0.7)',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    userSelect: 'none',
  },
  editor: {
    position: 'fixed',
    zIndex: 1000,
    width: 160,
    padding: '4px 6px',
    fontSize: 12,
    borderRadius: 4,
    border: '1px solid rgba(0, 0, 0, 0.2)',
    boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
    outline: 'none',
    color: '#333',
    background: '#fff',
  },
};

/** Pure visual, also used as the drag preview */
export const DividerVisual = injectSheet(styles)(({ classes, label }: DividerVisualProps) => (
  <div className={classes!.container}>
    <div className={classes!.line} />
    {label && <div className={classes!.label}>{label}</div>}
  </div>
)) as React.ComponentType<{ label: string }>;

const dividerSource = {
  beginDrag(props: Props) {
    return {
      applicationId: props.item,
      index: props.index,
      isDivider: true,
      label: props.label,
    };
  },
};

@DropTarget('APP_DOCK_APP', dockAppTarget, connect => ({
  connectDropTarget: connect.dropTarget(),
}))
@DragSource('APP_DOCK_APP', dividerSource, (connect, monitor) => ({
  connectDragSource: connect.dragSource(),
  connectDragPreview: connect.dragPreview(),
  isDragging: monitor.isDragging(),
}))
@injectSheet(styles)
class DockDivider extends React.PureComponent<Props, State> {
  state: State = { editing: false, draft: '', editorPosition: null };
  private containerRef = React.createRef<HTMLDivElement>();

  componentDidMount() {
    this.props.connectDragPreview(getEmptyImage());
  }

  componentDidUpdate() {
    // see DraggableAppDockIcon (react-dnd issue #1428)
    this.props.connectDragPreview(getEmptyImage());
  }

  startEditing = () => {
    const el = this.containerRef.current;
    const rect = el ? el.getBoundingClientRect() : null;
    this.setState({
      editing: true,
      draft: this.props.label,
      editorPosition: rect ? { top: rect.top + rect.height / 2 - 14, left: rect.right + 4 } : null,
    });
  }

  commitEditing = () => {
    if (!this.state.editing) return;
    this.setState({ editing: false });
    if (this.state.draft !== this.props.label) {
      this.props.onRename(this.props.dividerId, this.state.draft);
    }
  }

  cancelEditing = () => this.setState({ editing: false });

  handleDraftChange = (e: React.ChangeEvent<HTMLInputElement>) => this.setState({ draft: e.target.value });

  // React events bubble through portals: keep them away from the divider/dock handlers
  stopPropagation = (e: React.SyntheticEvent) => e.stopPropagation();

  handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    e.stopPropagation();
    if (e.key === 'Enter') this.commitEditing();
    if (e.key === 'Escape') this.cancelEditing();
  }

  handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const { dividerId, item, label, onRemove, onAddDividerBelow } = this.props;
    const menu = remote.Menu.buildFromTemplate([
      { label: label ? 'Rename Divider…' : 'Add Label…', click: () => this.startEditing() },
      ...(label ? [{ label: 'Remove Label', click: () => this.props.onRename(dividerId, '') }] : []),
      { label: 'Add Divider Below', click: () => onAddDividerBelow(item) },
      { type: 'separator' as const },
      { label: 'Remove Divider', click: () => onRemove(dividerId) },
    ]);
    menu.popup({ window: remote.getCurrentWindow() });
  }

  render() {
    const { connectDragSource, connectDropTarget, isDragging, label, classes } = this.props;
    const { editing, draft, editorPosition } = this.state;

    return connectDragSource(connectDropTarget(
      <div
        className="l-dock__scroll__item"
        style={{ opacity: isDragging ? 0 : undefined }}
        title={label || 'Divider: double-click to add a label, right-click for options'}
        onDoubleClick={this.startEditing}
        onContextMenu={this.handleContextMenu}
      >
        <div ref={this.containerRef}>
          <DividerVisual label={label} />
        </div>
        {editing && createPortal(
          <input
            className={classes!.editor}
            style={editorPosition || undefined}
            autoFocus={true}
            value={draft}
            maxLength={MAX_DIVIDER_LABEL_LENGTH}
            placeholder="Label (e.g. Work)"
            onChange={this.handleDraftChange}
            onKeyDown={this.handleKeyDown}
            onBlur={this.commitEditing}
            onClick={this.stopPropagation}
            onMouseDown={this.stopPropagation}
            onDoubleClick={this.stopPropagation}
            onContextMenu={this.stopPropagation}
          />,
          document.body
        )}
      </div>
    ));
  }
}

export default DockDivider as any as React.ComponentType<OwnProps>;
