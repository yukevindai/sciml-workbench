"""Private Vercel Queues subscriber, discovered at build time without service IO."""
from vercel.queue import Message, subscribe
from workbench.config import load_settings
from workbench.queue_runtime import TOPIC, consume


@subscribe(topic=TOPIC, consumer_group='workbench-executor-v1',
           retry_after=30, max_concurrency=3, max_attempts=8)
async def execute(message: Message[dict[str, object]]) -> None:
    await consume(load_settings(), message.payload, str(message.message_id))
