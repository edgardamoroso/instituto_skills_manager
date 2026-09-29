import { Router } from 'express';
import {
  createVideo,
  deleteVideo,
  listAllVideos,
  listPublishedVideos,
  updateVideo,
} from '../services/videoService.js';
import { requireAdmin } from '../middleware/auth.js';
import { audit } from '../lib/audit.js';
import { wrap } from '../lib/http.js';

const router = Router();

router.get('/', wrap((_request, response) => response.json(listPublishedVideos())));

router.get('/manage', requireAdmin, wrap((_request, response) => response.json(listAllVideos())));

router.post('/', requireAdmin, wrap((request, response) => {
  const video = createVideo(request.body || {});
  audit('video.create', { request, target: video.id, detail: video.title });
  response.status(201).json(video);
}));

router.patch('/:videoId', requireAdmin, wrap((request, response) => {
  const video = updateVideo(request.params.videoId, request.body || {});
  audit('video.update', { request, target: video.id, detail: `status=${video.status}` });
  response.json(video);
}));

router.delete('/:videoId', requireAdmin, wrap((request, response) => {
  deleteVideo(request.params.videoId);
  audit('video.delete', { request, target: request.params.videoId });
  response.status(204).end();
}));

export default router;
