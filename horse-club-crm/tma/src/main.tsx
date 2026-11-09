import React from 'react';
import { render } from 'react-dom';
import { App } from './App';
import './styles.css';

const _h = React.createElement;

render(<React.StrictMode><App /></React.StrictMode>, document.getElementById('root')!);
