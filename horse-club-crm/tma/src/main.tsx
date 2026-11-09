import React from 'react';
import { render } from 'react-dom';
import { App } from './App';
import { ErrorBoundary } from './ErrorBoundary';
import './styles.css';

const _h = React.createElement;

render(<React.StrictMode><ErrorBoundary><App /></ErrorBoundary></React.StrictMode>, document.getElementById('root')!);
