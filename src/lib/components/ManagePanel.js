import React from 'react';
import ReactCSSTransitionGroup from 'react-addons-css-transition-group';

import classnames from 'classnames';
import { NEXT_OPEN } from '../times';
import { getLocalizedDateTime } from '../time-formats';
import DatePickerPanel from './DatePickerPanel';
import { idForItem } from '../utils';

// 5 second delay before auto-removing undo entries
const CLEAR_UNDO_DELAY = 5000;

export default class ManagePanel extends React.Component {
  constructor(props) {
    super(props);
    this.state = {
      datepickerActive: false,
      editedItem: null,
      dateChoice: props.moment(),
      undoEntries: {}
    };
    this.clearUndoTimer = null;
  }

  render() {
    const { id, entries, active, tabIsSnoozable, dontShow, updateDontShow, moment } = this.props;
    const { undoEntries, datepickerActive } = this.state;

    const sortedEntries = Object.values({...entries, ...undoEntries});
    sortedEntries.sort((a, b) => {
      if (a.time === NEXT_OPEN) {
        if (b.time === NEXT_OPEN) {
          return a.title.localeCompare(b.title);
        } else {
          return -1;
        }
      } else if (b.time === NEXT_OPEN) {
        return 1;
      } else {
        return a.time - b.time;
      }
    });

    return (
      <ReactCSSTransitionGroup component="div" transitionName="panel" transitionEnterTimeout={250} transitionLeaveTimeout={250}>
        <div id={id} className={classnames('panel', { active, obscured: datepickerActive, static: !tabIsSnoozable })}>
          <div className="header">{browser.i18n.getMessage('manageHeader')}</div>
          <div className="content">
            { (sortedEntries.length > 0) ? (
              <ReactCSSTransitionGroup component="ul" className="entries" transitionName="entry" transitionEnterTimeout={250} transitionLeaveTimeout={250}>
                { sortedEntries.map(item => this.renderEntry(item)) }
              </ReactCSSTransitionGroup>
            ) : (
              <div className="empty-entries">
                <div className="icon">
                  <img src="../icons/bell_icon.svg" width="64" height="64" />
                </div>
                <div className="message">{browser.i18n.getMessage('manageNoSnoozes')}</div>
              </div>
            )}
            <div className="manage-confirm">
              <input type="checkbox" id="confirm-checkbox" checked={!dontShow}
                onChange={event => updateDontShow(!event.target.checked)}/>
              <label htmlFor="confirm-checkbox">{browser.i18n.getMessage('manageConfirmLabel')}</label>
            </div>
          </div>
          <div className={classnames('footer', { 'hide': !tabIsSnoozable })}>
            <div className="back" onClick={() => this.handleBack()}><span>{
              browser.i18n.getMessage('manageBack')
            }</span></div>
          </div>
        </div>
        {datepickerActive && <DatePickerPanel id="manageCalendar" key="manageCalendar"
                         active={datepickerActive}
                         header={browser.i18n.getMessage('manageCalendarHeader')}
                         defaultValue={this.state.dateChoice}
                         onClose={ () => this.closeTimeSelect() }
                         onSelect={ value => this.confirmTimeSelect(value) }
                         moment={ moment } />}
      </ReactCSSTransitionGroup>
    );
  }

  getDisplayUrl(url) {
    if (!url) {
      return '&nbsp;';
    }
    const parser = document.createElement('a');
    parser.href = url;
    if (parser.protocol.startsWith('http')) {
      return parser.host.replace(/^www\./, '');
    }
    return url;
  }

  getDate(time) {
    if (time === NEXT_OPEN) {
      const message = browser.i18n.getMessage('manageDateNextOpen');
      return message.split('<br>', '2')[0] || message;
    }
    const moment = this.props.moment;
    if (moment(time).year() !== moment().year()) {
      return getLocalizedDateTime(moment(time), 'date_year') || browser.i18n.getMessage('manageDateLater');
    }
    return getLocalizedDateTime(moment(time), 'date_day') || browser.i18n.getMessage('manageDateLater');
  }

  getTime(time) {
    if (time === NEXT_OPEN) {
      const message = browser.i18n.getMessage('manageDateNextOpen');
      return message.split('<br>', '2')[1] || '';
    }
    return getLocalizedDateTime(this.props.moment(time), 'short_time') || '';
  }

  getEditable(time) {
    if (time === NEXT_OPEN) {
      return false;
    }
    return true;
  }

  renderEntry(item) {
    const url = this.getDisplayUrl(item.url);
    const key = idForItem(item);
    return (
      <li className={classnames('entry', { undo: item.isUndo })} key={key}>
        <div className="icon">
          <img src={item.icon || '../icons/nightly.svg'} />
        </div>
        <div className="content" onClick={() => this.handleItemClick(item)}>
          <div className="title" title={item.title}>{item.title || '&nbsp;'}</div>
          <div className="url" title={item.url}>{url}</div>
        </div>
        <div className={classnames('date', {'editable': this.getEditable(item.time) })} onClick={() => this.handleEntryEdit(item)}>
          <span>{this.getDate(item.time)}</span>
          <span>{this.getTime(item.time)}</span>
        </div>
        {item.isUndo ? (
          <div className="undo" onClick={() => this.handleItemUndo(item)}>
            <img title={browser.i18n.getMessage('manageUndo')} src="../icons/undo.svg" width="16" height="16" />
          </div>
        ) : (
          <div className="delete" onClick={() => this.handleItemDelete(item)}>
            <img title={browser.i18n.getMessage('manageDelete')} src="../icons/trash.svg" width="16" height="16" />
          </div>
        )}
      </li>
    );
  }

  shouldIgnoreClicks() {
    const { active } = this.props;
    const { datepickerActive } = this.state;
    return !active || datepickerActive;
  }

  handleBack() {
    if (this.shouldIgnoreClicks()) { return; }
    const { switchPanel } = this.props;
    switchPanel('main');
  }

  handleItemClick(item) {
    if (this.shouldIgnoreClicks()) { return; }
    const { openSnoozedTab } = this.props;
    openSnoozedTab(item);
  }

  handleItemDelete(item) {
    if (this.shouldIgnoreClicks()) { return; }

    const { cancelSnoozedTab } = this.props;
    cancelSnoozedTab(item);

    const newUndoEntries = {...this.state.undoEntries};
    newUndoEntries[idForItem(item)] = {...item, isUndo: true};
    this.setState({ undoEntries: newUndoEntries });

    this.startClearUndoTimer();
  }

  startClearUndoTimer() {
    if (this.clearUndoTimer) {
      clearTimeout(this.clearUndoTimer);
    }
    this.clearUndoTimer = setTimeout(() => {
      this.setState({ undoEntries: {} });
    }, CLEAR_UNDO_DELAY);
  }

  handleItemUndo(item) {
    if (this.shouldIgnoreClicks()) { return; }

    const newUndoEntries = {...this.state.undoEntries};
    delete newUndoEntries[idForItem(item)];
    this.setState({ undoEntries: newUndoEntries });

    const { undeleteSnoozedTab } = this.props;
    delete item.isUndo;
    undeleteSnoozedTab(item);
  }

  handleEntryEdit(item) {
    if (this.shouldIgnoreClicks()) { return; }
    if (!this.getEditable(item.time)) {
      // Just open the tab if we can't edit it.
      this.props.openSnoozedTab(item);
      return;
    }
    this.setState({
      datepickerActive: true,
      editedItem: item,
      dateChoice: this.props.moment(item.time)
    });
  }

  handleTimeSelect(value) {
    this.setState({ dateChoice: value });
  }

  closeTimeSelect() {
    this.setState({ datepickerActive: false });
  }

  confirmTimeSelect(dateChoice) {
    const { editedItem } = this.state;
    const { updateSnoozedTab } = this.props;

    if (!dateChoice) { return; }

    updateSnoozedTab(
      editedItem,
      { ...editedItem, time: dateChoice.valueOf() }
    );
    this.setState({
      datepickerActive: false,
      editedItem: null
    });
  }

}

ManagePanel.propTypes = {
  active: React.PropTypes.bool.isRequired,
  cancelSnoozedTab: React.PropTypes.func.isRequired,
  dontShow: React.PropTypes.bool.isRequired,
  entries: React.PropTypes.object.isRequired,
  id: React.PropTypes.string.isRequired,
  moment: React.PropTypes.func.isRequired,
  openSnoozedTab: React.PropTypes.func.isRequired,
  switchPanel: React.PropTypes.func.isRequired,
  tabIsSnoozable: React.PropTypes.bool.isRequired,
  undeleteSnoozedTab: React.PropTypes.func.isRequired,
  updateDontShow: React.PropTypes.func.isRequired,
  updateSnoozedTab: React.PropTypes.func.isRequired,
};
