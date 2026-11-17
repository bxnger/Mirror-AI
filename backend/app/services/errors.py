class LoopError(Exception):
    """A Decision-to-Outcome loop step was called out of order or with invalid data."""

    def __init__(self, message: str, stage: str | None = None, status_code: int = 409):
        super().__init__(message)
        self.message = message
        self.stage = stage
        self.status_code = status_code
