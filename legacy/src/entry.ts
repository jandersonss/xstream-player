import './polyfills';
import { redirectToModernIfSupported } from './browser';

redirectToModernIfSupported();
import './app';
