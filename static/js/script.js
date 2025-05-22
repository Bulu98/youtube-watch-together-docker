document.addEventListener('DOMContentLoaded', () => {
    const socket = io();

    const nameInput = document.getElementById('name-input');
    const setNameButton = document.getElementById('set-name-button');
    const userListDiv = document.getElementById('user-list');
    const nameInputArea = document.getElementById('name-input-area');
    
    const videoUrlInput = document.getElementById('video-url-input');
    const addToQueueButton = document.getElementById('add-to-queue-button');
    const videoQueueDiv = document.getElementById('video-queue');

    nameInputArea.style.display = 'flex';

    socket.on('assign_default_name', (data) => {
        nameInput.value = data.name;
    });

    socket.on('update_user_list', (users) => {
        userListDiv.innerHTML = '<h3>Users</h3>'; 
        const ul = document.createElement('ul');
        if (users) {
            users.forEach(user => {
                const li = document.createElement('li');
                li.textContent = user.name + (user.id === socket.id ? ' (You)' : '');
                ul.appendChild(li);
            });
        }
        userListDiv.appendChild(ul);
    });

    setNameButton.addEventListener('click', () => {
        const name = nameInput.value.trim();
        if (name) {
            socket.emit('set_name', { name: name });
            localStorage.setItem('userName', name); // Store name
        } else {
            alert('Please enter a name.');
        }
    });

    socket.on('connect', () => {
        console.log('Connected to server with ID:', socket.id);
        const savedName = localStorage.getItem('userName');
        if (savedName) {
            console.log('Found saved name in localStorage:', savedName);
            // No need to set nameInput.value here, as 'assign_default_name' or subsequent 'update_user_list' will handle it.
            socket.emit('set_name', { name: savedName });
        }
    });

    socket.on('disconnect', () => {
        console.log('Disconnected from server.');
    });

    socket.on('error', (data) => {
        console.error('Server error:', data.message);
        alert('Error: ' + data.message);
    });

    // YouTube Player Integration
    let player;
    let videoIdToLoad = null; 
    let lastKnownTime = 0;
    let processingRemoteState = false; // Flag to ignore self-triggered events
    let lastEmittedState = -100; // YT.PlayerState or custom value to avoid rapid re-emission


    window.onYouTubeIframeAPIReady = function() {
        console.log("YouTube Iframe API Ready");
        player = new YT.Player('player', {
            height: '100%',
            width: '100%',
            playerVars: {
                'playsinline': 1,
                'autoplay': 0, 
                'controls': 1 
            },
            events: {
                'onReady': onPlayerReady,
                'onError': onPlayerError,
                'onStateChange': onPlayerStateChange
            }
        });
    };

    function onPlayerReady(event) {
        console.log("YouTube Player Ready");
        if (videoIdToLoad) { 
            processingRemoteState = true; // Mark as processing remote state for initial load
            player.loadVideoById(videoIdToLoad.id, videoIdToLoad.time);
            lastKnownTime = videoIdToLoad.time;
            videoIdToLoad = null; 
        }
    }

    function onPlayerError(event) {
        console.error("YouTube Player Error:", event.data);
    }

    function onPlayerStateChange(event) {
        console.log("Player state changed:", event.data, "Processing remote:", processingRemoteState);

        if (processingRemoteState) {
            // If we are processing a remote state, we only care about it "settling"
            if (event.data === YT.PlayerState.PLAYING || event.data === YT.PlayerState.PAUSED) {
                console.log("Remote state processed, resetting flag.");
                processingRemoteState = false;
            }
            // For BUFFERING that leads to PLAYING, we might still be processingRemoteState.
            // The key is that we don't emit new sync events while processingRemoteState.
            return;
        }

        // Avoid emitting rapid duplicate states
        if (event.data === lastEmittedState && event.data !== YT.PlayerState.BUFFERING) {
             // Allow buffering to be re-checked, but not play/pause if already sent
            // console.log("State is same as last emitted, not re-emitting.");
            // return; 
            // This simple check might be too aggressive. For now, let's allow re-emission if not processing remote.
        }


        if (event.data == YT.PlayerState.PLAYING) {
            const currentTime = player.getCurrentTime();
            console.log("Player is PLAYING, emitting 'sync_play' at time:", currentTime); // Original log
            console.log("DEBUG: Player state PLAYING (user action or natural play). Emitting 'sync_play'. Current time:", currentTime);
            socket.emit('sync_play', { time: currentTime });
            lastKnownTime = currentTime;
            lastEmittedState = YT.PlayerState.PLAYING;
        } else if (event.data == YT.PlayerState.PAUSED) {
            console.log("Player is PAUSED, emitting 'sync_pause'"); // Original log
            console.log("DEBUG: Player state PAUSED (user action). Emitting 'sync_pause'.");
            socket.emit('sync_pause');
            lastEmittedState = YT.PlayerState.PAUSED;
        } else if (event.data == YT.PlayerState.ENDED) {
            console.log("Video ended. Emitting 'video_ended' to server.");
            socket.emit('video_ended');
            lastKnownTime = 0;
            lastEmittedState = YT.PlayerState.ENDED;
        } else if (event.data == YT.PlayerState.BUFFERING) {
            // console.log("Player is BUFFERING.");
            // No action needed for buffering, but good to be aware of it.
            // We might want to emit buffering to show a status to other users.
            lastEmittedState = YT.PlayerState.BUFFERING;
        }
    }

    // Server-driven playback events
    socket.on('play_video_at_time', function(data) {
        console.log("DEBUG: Received 'play_video_at_time' from server. Data:", data);
        const currentLoadedVideoId = player && typeof player.getVideoData === 'function' && player.getVideoData().video_id ? player.getVideoData().video_id : null;
        
        processingRemoteState = true; // Set flag before making changes

        if (player && typeof player.loadVideoById === 'function') {
            if (currentLoadedVideoId !== data.videoId) {
                console.log("DEBUG: 'play_video_at_time' - Loading new video:", data.videoId, "at time:", data.time);
                player.loadVideoById(data.videoId, data.time);
            } else {
                console.log("DEBUG: 'play_video_at_time' - Seeking/playing current video to:", data.time);
                player.seekTo(data.time, true); // true allows seek ahead
                player.playVideo(); // Ensure it plays after seek
            }
            lastKnownTime = data.time;
        } else {
            videoIdToLoad = { id: data.videoId, time: data.time }; // Store with time
            console.log("DEBUG: 'play_video_at_time' - Player not ready. Queuing videoIdToLoad:", videoIdToLoad);
        }
        // processingRemoteState will be reset by onPlayerStateChange when player settles
    });

    socket.on('pause_video', function() {
        console.log("DEBUG: Received 'pause_video' from server.");
        if (player && typeof player.pauseVideo === 'function') {
            processingRemoteState = true; // Set flag before making changes
            player.pauseVideo();
        }
        // processingRemoteState will be reset by onPlayerStateChange
    });
    
    // This handler is for when the server decides a *new* video from the queue should play (e.g., first video, or next after 'ended')
    // It's distinct from 'play_video_at_time' which is for syncing an *already playing* video.
    socket.on('play_video', (data) => {
        console.log("DEBUG: Received 'play_video' (new video from queue) from server. Data:", data);
        const videoId = data.videoId;
        // console.log(`Received 'play_video' (new video from queue) from server. Loading video: ${videoId}`); // Original log replaced by DEBUG
        
        if (player && typeof player.loadVideoById === 'function') {
            processingRemoteState = true; // Mark that this change is server-initiated
            player.loadVideoById(videoId); // Server implies starting from the beginning (or YT default)
            player.playVideo(); 
            lastKnownTime = 0; // Reset time for a new video
        } else {
            videoIdToLoad = {id: videoId, time: 0 }; // Assume start from 0 for a new video
            console.log("DEBUG: 'play_video' - Player not ready. Queuing videoIdToLoad:", videoIdToLoad);
        }
        // processingRemoteState will be reset by onPlayerStateChange
    });


    function extractVideoID(url) {
        const regex = /(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
        const match = url.match(regex);
        return match ? match[1] : null;
    }

    socket.on('update_queue', (queueArray) => {
        console.log("DEBUG: Received 'update_queue' event from server.");
        console.log("DEBUG: Queue data received:", queueArray);
        if (!Array.isArray(queueArray)) {
            console.error("DEBUG: Received queue data is not an array!", queueArray);
            // Potentially try to recover or show an error, or just return
            return; 
        }
        console.log("DEBUG: Calling renderQueue with received data.");
        renderQueue(queueArray);
        console.log("DEBUG: renderQueue finished.");
    });

    function renderQueue(queueArray) {
        const h3 = videoQueueDiv.querySelector('h3');
        videoQueueDiv.innerHTML = ''; 
        if (h3) videoQueueDiv.appendChild(h3);

        if (!queueArray) return;

        queueArray.forEach((video, index) => {
            const queueItemDiv = document.createElement('div');
            queueItemDiv.className = 'queue-item';
            queueItemDiv.dataset.videoId = video.id;
            queueItemDiv.dataset.index = index;

            const thumbnail = document.createElement('img');
            thumbnail.src = `https://img.youtube.com/vi/${video.id}/mqdefault.jpg`;
            thumbnail.alt = 'Video Thumbnail';
            thumbnail.className = 'queue-item-thumbnail';
            
            const detailsDiv = document.createElement('div');
            detailsDiv.className = 'queue-item-details';
            
            const titleSpan = document.createElement('span');
            titleSpan.className = 'queue-item-title';
            titleSpan.textContent = video.title;
            detailsDiv.appendChild(titleSpan);

            const addedBySpan = document.createElement('span');
            addedBySpan.className = 'queue-item-added-by';
            addedBySpan.textContent = `Added by: ${video.added_by_name || 'Unknown'}`;
            addedBySpan.style.fontSize = '0.8em';
            addedBySpan.style.color = '#aaa';
            detailsDiv.appendChild(addedBySpan);

            const actionsDiv = document.createElement('div');
            actionsDiv.className = 'queue-item-actions';

            const moveUpBtn = document.createElement('button');
            moveUpBtn.className = 'queue-action-btn move-up-btn';
            moveUpBtn.textContent = '↑';
            if (index === 0) moveUpBtn.disabled = true;
            moveUpBtn.addEventListener('click', () => {
                socket.emit('reorder_video', { videoId: video.id, direction: 'up' });
            });

            const moveDownBtn = document.createElement('button');
            moveDownBtn.className = 'queue-action-btn move-down-btn';
            moveDownBtn.textContent = '↓';
            if (index === queueArray.length - 1) moveDownBtn.disabled = true;
            moveDownBtn.addEventListener('click', () => {
                socket.emit('reorder_video', { videoId: video.id, direction: 'down' });
            });
            
            const removeBtn = document.createElement('button');
            removeBtn.className = 'queue-action-btn remove-btn';
            removeBtn.textContent = 'X';
            removeBtn.addEventListener('click', () => {
                socket.emit('remove_video', { videoId: video.id });
            });

            actionsDiv.appendChild(moveUpBtn);
            actionsDiv.appendChild(moveDownBtn);
            actionsDiv.appendChild(removeBtn);

            queueItemDiv.appendChild(thumbnail);
            queueItemDiv.appendChild(detailsDiv);
            queueItemDiv.appendChild(actionsDiv);
            
            videoQueueDiv.appendChild(queueItemDiv);
        });
    }

    addToQueueButton.addEventListener('click', () => {
        const videoUrl = videoUrlInput.value.trim();
        if (videoUrl) {
            const videoId = extractVideoID(videoUrl);
            if (videoId) {
                socket.emit('add_video', { videoId: videoId });
                videoUrlInput.value = ''; 
            } else {
                alert('Invalid YouTube URL. Please enter a valid URL.');
            }
        } else {
            alert('Please enter a YouTube video URL.');
        }
    });
});
