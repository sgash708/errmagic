import * as React from 'react';

interface ErrmagicErrorBoundaryProps {
    fallback?: React.ReactNode;
    children: React.ReactNode;
}
interface ErrmagicErrorBoundaryState {
    hasError: boolean;
}
declare class ErrmagicErrorBoundary extends React.Component<ErrmagicErrorBoundaryProps, ErrmagicErrorBoundaryState> {
    constructor(props: ErrmagicErrorBoundaryProps);
    static getDerivedStateFromError(): ErrmagicErrorBoundaryState;
    componentDidCatch(error: unknown, errorInfo: React.ErrorInfo): void;
    render(): React.ReactNode;
}

export { ErrmagicErrorBoundary, type ErrmagicErrorBoundaryProps };
