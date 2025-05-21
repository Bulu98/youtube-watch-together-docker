from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit
import random # Not strictly needed for this step, but was in previous version

app = Flask(__name__)
app.config['SECRET_KEY'] = 'super_secret_key_for_watch_party!' # Should be a real secret in production
socketio = SocketIO(app)

connected_users = []
video_queue = []
current_video_index = -1 # -1 means nothing is playing or queue is finished

# Helper function to get user name from session ID
def get_user_name(session_id):
    for user in connected_users:
        if user['id'] == session_id:
            return user['name']
    return "Unknown User"

@app.route('/')
def index():
    return render_template('index.html')

@socketio.on('connect')
def handle_connect():
    session_id = request.sid
    default_name = f"USER-{session_id[:6]}"
    user = {'id': session_id, 'name': default_name}
    connected_users.append(user)
    
    print(f"User connected: {user}")
    
    emit('assign_default_name', {'name': default_name}, room=session_id)
    emit('update_user_list', connected_users, broadcast=True)
    emit('update_queue', video_queue, room=session_id) # Send current queue to new user
    
    # If there's a video supposed to be playing, tell the new user to play it
    if 0 <= current_video_index < len(video_queue):
        current_video = video_queue[current_video_index]
        # When a new user connects, if a video is playing, send it with time 0 (or last known time)
        # For simplicity, sending with time 0. More complex state sync can be added.
        emit('play_video_at_time', {'videoId': current_video['id'], 'time': 0}, room=session_id)


@socketio.on('set_name')
def handle_set_name(data):
    session_id = request.sid
    new_name = data.get('name')
    if new_name:
        for user in connected_users:
            if user['id'] == session_id:
                user['name'] = new_name
                print(f"User {session_id} set name to {new_name}")
                # Update names in queue if they added videos
                for video_item in video_queue:
                    if video_item['added_by_id'] == session_id:
                        video_item['added_by_name'] = new_name
                emit('update_queue', video_queue, broadcast=True) # Update queue if names changed
                break
        emit('update_user_list', connected_users, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
    session_id = request.sid
    global connected_users
    connected_users = [user for user in connected_users if user['id'] != session_id]
    print(f"User disconnected: {session_id}")
    emit('update_user_list', connected_users, broadcast=True)
    # Optionally, could remove videos added by this user, or reassign them. For now, keep them.

@socketio.on('add_video')
def handle_add_video(data):
    global current_video_index
    video_id = data.get('videoId')
    if not video_id:
        emit('error', {'message': 'Invalid video ID'}, room=request.sid)
        return

    user_name = get_user_name(request.sid)
    # Using placeholder title as discussed
    title = f"Video {video_id}" 
    
    video_obj = {
        'id': video_id, 
        'title': title, 
        'added_by_id': request.sid,
        'added_by_name': user_name
    }
    video_queue.append(video_obj)
    print(f"Video added to queue: {video_obj} by {user_name}")
    emit('update_queue', video_queue, broadcast=True)

    if len(video_queue) == 1 and current_video_index == -1: # If it's the first video and nothing is playing
        current_video_index = 0
        print(f"Playing first video in queue: {video_queue[current_video_index]['id']}")
        emit('play_video', {'videoId': video_queue[current_video_index]['id']}, broadcast=True)

@socketio.on('remove_video')
def handle_remove_video(data):
    global current_video_index
    video_id_to_remove = data.get('videoId') # Assuming removal by ID for simplicity
    if not video_id_to_remove:
        emit('error', {'message': 'Invalid video ID for removal'}, room=request.sid)
        return

    original_queue_length = len(video_queue)
    removed_video_index = -1

    for i, video in enumerate(video_queue):
        if video['id'] == video_id_to_remove:
            removed_video_index = i
            break
    
    if removed_video_index != -1:
        removed_video = video_queue.pop(removed_video_index)
        print(f"Video removed: {removed_video['id']}")
        emit('update_queue', video_queue, broadcast=True)

        if removed_video_index == current_video_index:
            # If the currently playing video was removed
            if removed_video_index < len(video_queue): # Play next if available
                print(f"Playing next video after removal: {video_queue[current_video_index]['id']}")
                emit('play_video', {'videoId': video_queue[current_video_index]['id']}, broadcast=True)
            else: # Queue ended
                current_video_index = -1
                print("Queue ended after removing current video.")
                # Optionally emit 'queue_finished'
        elif removed_video_index < current_video_index:
            # If a video before the current one was removed, adjust index
            current_video_index -= 1
    else:
        emit('error', {'message': 'Video not found in queue for removal'}, room=request.sid)


@socketio.on('reorder_video')
def handle_reorder_video(data):
    video_id = data.get('videoId')
    direction = data.get('direction') # 'up' or 'down'

    if not video_id or direction not in ['up', 'down']:
        emit('error', {'message': 'Invalid data for reordering'}, room=request.sid)
        return

    try:
        current_idx = next(i for i, video in enumerate(video_queue) if video['id'] == video_id)
    except StopIteration:
        emit('error', {'message': 'Video not found for reordering'}, room=request.sid)
        return

    new_idx = current_idx
    if direction == 'up':
        if current_idx > 0:
            new_idx = current_idx - 1
    elif direction == 'down':
        if current_idx < len(video_queue) - 1:
            new_idx = current_idx + 1

    if new_idx != current_idx:
        video_queue.insert(new_idx, video_queue.pop(current_idx))
        print(f"Video {video_id} reordered from {current_idx} to {new_idx}")
        
        # Adjust current_video_index if the playing video or one before it moved
        if current_video_index == current_idx:
            current_video_index = new_idx
        elif current_video_index == new_idx and current_idx > new_idx : # Target position was current playing, item moved up to it
             current_video_index +=1
        elif current_video_index == new_idx and current_idx < new_idx : # Target position was current playing, item moved down to it
             current_video_index -=1

        emit('update_queue', video_queue, broadcast=True)


@socketio.on('video_ended')
def handle_video_ended():
    global current_video_index
    # For now, trust any client's 'video_ended' event for the current video.
    # A more robust system might check if request.sid is the one who started the video or a designated host.
    print(f"Received 'video_ended'. Current index: {current_video_index}")

    if 0 <= current_video_index < len(video_queue): # Ensure current_video_index is valid
        current_video_index += 1
        if current_video_index < len(video_queue):
            next_video = video_queue[current_video_index]
            print(f"Playing next video: {next_video['id']}")
            emit('play_video', {'videoId': next_video['id']}, broadcast=True)
        else:
            current_video_index = -1 # Reached end of queue
            print("Queue finished.")
            # Optionally emit 'queue_finished' event to clients
            # emit('queue_finished', broadcast=True) 
    else:
        # This might happen if multiple clients send 'video_ended' or if state is somehow inconsistent.
        print("Video ended but current_video_index was out of sync or queue already finished.")
        # Optionally try to resync or reset state.
        if not video_queue: # if queue is empty
            current_video_index = -1


@socketio.on('sync_play')
def handle_sync_play(data):
    if 0 <= current_video_index < len(video_queue):
        video_id = video_queue[current_video_index]['id']
        time = data.get('time', 0)
        print(f"Sync play: {video_id} at time {time}")
        emit('play_video_at_time', {'videoId': video_id, 'time': time}, broadcast=True, include_self=False)

@socketio.on('sync_pause')
def handle_sync_pause():
    if 0 <= current_video_index < len(video_queue):
        video_id = video_queue[current_video_index]['id'] # For logging or context if needed
        print(f"Sync pause: {video_id}")
        emit('pause_video', broadcast=True, include_self=False)


if __name__ == '__main__':
    socketio.run(app, debug=True, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True) # host='0.0.0.0' for accessibility, port 5000
