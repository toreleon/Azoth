import React from "react";
import { Box, Text } from "ink";

interface State { error: Error | null }

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  componentDidCatch(error: Error) {
    this.setState({ error });
  }
  render() {
    if (this.state.error) {
      return (
        <Box borderStyle="round" borderColor="red" padding={1} flexDirection="column">
          <Text bold color="red">Render error</Text>
          <Text>{this.state.error.message}</Text>
        </Box>
      );
    }
    return this.props.children as React.ReactElement;
  }
}
