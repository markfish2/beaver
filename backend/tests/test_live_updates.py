import asyncio
import unittest

import httpx
from fastapi import FastAPI, HTTPException

from app.live_updates import install_live_updates, subscribers


class LiveUpdatesTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.app = FastAPI()
        install_live_updates(self.app)

        @self.app.put('/api/nodes/test')
        async def write():
            return {'ok': True}

        @self.app.put('/api/memos/failure')
        async def fail():
            raise HTTPException(409)

        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=self.app), base_url='http://test')

    async def asyncTearDown(self):
        await self.client.aclose()
        subscribers.clear()

    async def test_authentication_required(self):
        response = await self.client.get('/api/live')
        self.assertEqual(response.status_code, 401)

    async def test_success_notifies_both_devices_with_origin(self):
        a, b = asyncio.Queue(maxsize=128), asyncio.Queue(maxsize=128)
        subscribers.update([a, b])
        await self.client.put('/api/nodes/test', headers={'X-Client-ID': 'writer'})
        for queue in (a, b):
            self.assertEqual(queue.get_nowait(), {'resource': 'nodes', 'source': 'writer'})
        await self.client.put('/api/memos/failure')
        self.assertTrue(a.empty())
        self.assertTrue(b.empty())

    async def test_overflow_requests_reconciliation(self):
        queue = asyncio.Queue(maxsize=1)
        queue.put_nowait({'resource': 'memos'})
        subscribers.add(queue)
        await self.client.put('/api/nodes/test')
        self.assertEqual(queue.get_nowait(), {'resource': 'all', 'source': ''})

    async def test_connect_reconciles_and_disconnect_cleans_up(self):
        route = next(route for route in self.app.routes if route.path == '/api/live')
        response = await route.endpoint()
        self.assertEqual(len(subscribers), 1)
        frame = await anext(response.body_iterator)
        self.assertIn('"resource":"all"', frame)
        await response.body_iterator.aclose()
        self.assertFalse(subscribers)
