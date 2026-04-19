import React, { useState, useEffect } from 'react';
import {
    StyleSheet, Text, View, TextInput, TouchableOpacity, ScrollView,
    Image, ActivityIndicator, Alert, SafeAreaView, KeyboardAvoidingView, Platform
} from 'react-native';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import MapView, { Marker } from 'react-native-maps';

// --- Constants ---
const API_URL = 'http://YOUR_LOCAL_IP:3000/api/reports'; // Replace with your actual IP for testing
const QUEUE_KEY = '@offline_report_queue';

const CATEGORIES = [
    { id: 1, name: 'Oil Spill' },
    { id: 2, name: 'Rough Seas' },
    { id: 3, name: 'Marine Debris' },
    { id: 4, name: 'Wildlife Entanglement' },
    { id: 7, name: 'Jellyfish Bloom' },
];

const SEVERITY_MAP: Record<number, string> = {
    1: 'low',
    2: 'medium',
    3: 'high',
    4: 'critical',
    5: 'critical',
};

// --- Types ---
interface ReportPayload {
    category_id: number;
    title: string;
    description: string;
    latitude: number;
    longitude: number;
    severity: string;
    photos: string[];
    queued_at: string;
}

export default function ReportSubmissionScreen() {
    // State
    const [categoryId, setCategoryId] = useState<number | null>(null);
    const [severitySlider, setSeveritySlider] = useState<number>(2); // 1-5 scale
    const [description, setDescription] = useState('');
    const [title, setTitle] = useState('');

    const [imageUri, setImageUri] = useState<string | null>(null);
    const [location, setLocation] = useState<{ latitude: number, longitude: number } | null>(null);

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isConnected, setIsConnected] = useState(true);
    const [queueCount, setQueueCount] = useState(0);
    const [syncStatus, setSyncStatus] = useState<string | null>(null);

    // --- Initialization ---
    useEffect(() => {
        // 1. Monitor network state for offline syncing
        const unsubscribe = NetInfo.addEventListener(state => {
            setIsConnected(!!state.isConnected);
            if (state.isConnected) {
                syncOfflineQueue();
            }
        });

        // 2. Fetch initial GPS and Queue
        (async () => {
            let { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') {
                Alert.alert('Permission to access location was denied');
                return;
            }

            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });

            checkQueueSize();
        })();

        return unsubscribe;
    }, []);

    // --- Offline Logic ---
    const checkQueueSize = async () => {
        try {
            const queue = await AsyncStorage.getItem(QUEUE_KEY);
            if (queue) {
                setQueueCount(JSON.parse(queue).length);
            }
        } catch (e) { console.error('Error checking queue', e); }
    };

    const syncOfflineQueue = async () => {
        try {
            const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
            if (!queueStr) return;

            let queue: ReportPayload[] = JSON.parse(queueStr);
            if (queue.length === 0) return;

            setSyncStatus(`Syncing ${queue.length} reports...`);

            let failedQ = [];
            for (const report of queue) {
                try {
                    const res = await fetch(API_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(report)
                    });
                    if (!res.ok) throw new Error('API Error');
                } catch (err) {
                    failedQ.push(report);
                }
            }

            await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(failedQ));
            setQueueCount(failedQ.length);
            setSyncStatus(failedQ.length === 0 ? 'Sync Complete' : 'Some syncs failed');
            setTimeout(() => setSyncStatus(null), 3000);

        } catch (e) {
            console.error('Sync error', e);
            setSyncStatus('Sync Failed');
        }
    };

    // --- Camera / Media ---
    const takePhoto = async () => {
        const { status } = await ImagePicker.requestCameraPermissionsAsync();
        if (status !== 'granted') return Alert.alert('Camera permission denied.');

        let result = await ImagePicker.launchCameraAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            allowsEditing: true,
            quality: 0.5,
        });

        if (!result.canceled && result.assets && result.assets.length > 0) {
            setImageUri(result.assets[0].uri);
        }
    };

    // --- Submission ---
    const submitReport = async () => {
        if (!categoryId || !location || !title) {
            return Alert.alert('Missing Info', 'Please provide a title, category, and ensure GPS is active.');
        }

        setIsSubmitting(true);

        const payload: ReportPayload = {
            category_id: categoryId,
            title: title,
            description: description,
            latitude: location.latitude,
            longitude: location.longitude,
            severity: SEVERITY_MAP[severitySlider],
            photos: imageUri ? [imageUri] : [], // Note: In production, upload to S3 first to get URL
            queued_at: new Date().toISOString(),
        };

        if (isConnected) {
            // Online: Direct POST
            try {
                const response = await fetch(API_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                if (!response.ok) throw new Error('Server returned ' + response.status);

                Alert.alert('Success', 'Hazard reported successfully!');
                resetForm();
            } catch (error) {
                saveToQueue(payload, 'Network failed. Saved offline.');
            }
        } else {
            // Offline: Save to AsyncStorage
            saveToQueue(payload, 'You are offline. Report saved and will sync automatically when out of dead zone.');
        }

        setIsSubmitting(false);
    };

    const saveToQueue = async (payload: ReportPayload, alertMsg: string) => {
        try {
            const queueStr = await AsyncStorage.getItem(QUEUE_KEY);
            const queue = queueStr ? JSON.parse(queueStr) : [];
            queue.push(payload);
            await AsyncStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
            setQueueCount(queue.length);
            Alert.alert('Saved Offline', alertMsg);
            resetForm();
        } catch (e) {
            Alert.alert('Error', 'Failed to save offline.');
        }
    };

    const resetForm = () => {
        setTitle('');
        setDescription('');
        setImageUri(null);
        setCategoryId(null);
        setSeveritySlider(2);
    };

    // --- UI ---
    return (
        <SafeAreaView style={styles.container}>
            {/* Header & Connectivity Bar */}
            <View style={styles.header}>
                <Text style={styles.headerTitle}>Ocean Sentinel</Text>
                {!isConnected && (
                    <View style={styles.offlineBadge}>
                        <MaterialIcons name="wifi-off" size={12} color="white" />
                        <Text style={styles.offlineText}>Offline Mode</Text>
                    </View>
                )}
            </View>

            <ScrollView contentContainerStyle={styles.scrollContent} keyboardShouldPersistTaps="handled">

                {/* Sync Status / Queue Banner */}
                {queueCount > 0 && (
                    <View style={styles.syncBanner}>
                        <ActivityIndicator size="small" color="#FFF" style={{ marginRight: 8, opacity: syncStatus?.includes('Syncing') ? 1 : 0 }} />
                        <Text style={styles.syncText}>
                            {syncStatus || `${queueCount} reports waiting for connection...`}
                        </Text>
                    </View>
                )}

                {/* Hazard Title */}
                <Text style={styles.label}>Observation Title</Text>
                <TextInput
                    style={styles.input}
                    placeholder="e.g. Large oil slick near harbor"
                    placeholderTextColor="#648A9F"
                    value={title}
                    onChangeText={setTitle}
                />

                {/* Hazard Category Selector */}
                <Text style={styles.label}>Hazard Type</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipContainer}>
                    {CATEGORIES.map(cat => (
                        <TouchableOpacity
                            key={cat.id}
                            style={[styles.chip, categoryId === cat.id && styles.chipActive]}
                            onPress={() => setCategoryId(cat.id)}
                        >
                            <Text style={[styles.chipText, categoryId === cat.id && styles.chipTextActive]}>
                                {cat.name}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                {/* Severity Slider (Simulated via buttons/blocks) */}
                <Text style={styles.label}>Severity Level (1-5)</Text>
                <View style={styles.severityContainer}>
                    {[1, 2, 3, 4, 5].map(level => (
                        <TouchableOpacity
                            key={level}
                            style={[
                                styles.severityBlock,
                                severitySlider >= level ? { backgroundColor: getSeverityColor(severitySlider) } : {}
                            ]}
                            onPress={() => setSeveritySlider(level)}
                        >
                            <Text style={styles.severityNum}>{level}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* Description Area */}
                <Text style={styles.label}>Detailed Description</Text>
                <TextInput
                    style={[styles.input, styles.textArea]}
                    placeholder="Describe the hazard size, direction of movement, weather conditions..."
                    placeholderTextColor="#648A9F"
                    multiline
                    numberOfLines={4}
                    value={description}
                    onChangeText={setDescription}
                />

                {/* Camera Integration */}
                <Text style={styles.label}>Visual Evidence</Text>
                <TouchableOpacity style={styles.cameraBtn} onPress={takePhoto}>
                    <Ionicons name="camera" size={24} color="white" />
                    <Text style={styles.cameraBtnText}>Capture Photo</Text>
                </TouchableOpacity>

                {imageUri && (
                    <View style={styles.imagePreviewContainer}>
                        <Image source={{ uri: imageUri }} style={styles.imagePreview} />
                        <TouchableOpacity style={styles.removeImageBtn} onPress={() => setImageUri(null)}>
                            <Ionicons name="close-circle" size={24} color="#FFF" />
                        </TouchableOpacity>
                    </View>
                )}

                {/* Mini GPS Tracker Map */}
                <Text style={styles.label}>Location GPS</Text>
                <View style={styles.mapContainer}>
                    {location ? (
                        <MapView
                            style={styles.map}
                            initialRegion={{
                                latitude: location.latitude,
                                longitude: location.longitude,
                                latitudeDelta: 0.05,
                                longitudeDelta: 0.05,
                            }}
                            onRegionChangeComplete={(region) => setLocation({ latitude: region.latitude, longitude: region.longitude })}
                        >
                            <Marker coordinate={location} />
                        </MapView>
                    ) : (
                        <View style={styles.mapLoader}>
                            <ActivityIndicator color="#15618A" />
                            <Text style={{ color: '#15618A', marginTop: 10 }}>Acquiring Satellite GPS...</Text>
                        </View>
                    )}
                </View>
                <Text style={styles.helperText}>Drag map to adjust pin manually if accurate.</Text>

            </ScrollView>

            {/* Submit Button Floating Bottom */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.submitBtn, (!categoryId || !title) && styles.submitBtnDisabled]}
                    onPress={submitReport}
                    disabled={isSubmitting || !categoryId || !title}
                >
                    {isSubmitting ? (
                        <ActivityIndicator color="white" />
                    ) : (
                        <>
                            <Text style={styles.submitBtnText}>
                                {isConnected ? 'SUBMIT REPORT' : 'STORE OFFLINE'}
                            </Text>
                            {!isConnected && <Ionicons name="cloud-offline" size={20} color="white" style={{ marginLeft: 8 }} />}
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </SafeAreaView>
    );
}

// --- Styles ---
const getSeverityColor = (val: number) => {
    if (val <= 2) return '#10B981'; // Green
    if (val === 3) return '#F59E0B'; // Yellow
    if (val === 4) return '#F97316'; // Orange
    return '#EF4444'; // Red
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#031B2A' },
    header: {
        padding: 20,
        paddingTop: Platform.OS === 'android' ? 40 : 20,
        backgroundColor: '#072C42',
        borderBottomWidth: 1,
        borderBottomColor: '#0F4463',
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
    },
    headerTitle: { color: 'white', fontSize: 20, fontWeight: 'bold' },
    offlineBadge: { backgroundColor: '#EF4444', flexDirection: 'row', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, alignItems: 'center' },
    offlineText: { color: 'white', fontSize: 10, fontWeight: 'bold', marginLeft: 4 },
    syncBanner: { backgroundColor: '#F59E0B', padding: 10, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    syncText: { color: 'white', fontWeight: 'bold', fontSize: 13 },

    scrollContent: { padding: 20, paddingBottom: 100 },
    label: { color: '#94A3B8', fontSize: 13, fontWeight: '600', marginBottom: 8, marginTop: 24, textTransform: 'uppercase' },
    input: { backgroundColor: '#072C42', borderWidth: 1, borderColor: '#0F4463', borderRadius: 8, color: 'white', padding: 14, fontSize: 16 },
    textArea: { height: 100, textAlignVertical: 'top' },

    chipContainer: { flexDirection: 'row', marginBottom: 5 },
    chip: { backgroundColor: '#072C42', borderWidth: 1, borderColor: '#0F4463', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, marginRight: 10 },
    chipActive: { backgroundColor: '#15618A', borderColor: '#38BDF8' },
    chipText: { color: '#94A3B8', fontWeight: '600' },
    chipTextActive: { color: 'white' },

    severityContainer: { flexDirection: 'row', justifyContent: 'space-between', backgroundColor: '#072C42', borderRadius: 8, padding: 4 },
    severityBlock: { flex: 1, height: 40, margin: 2, borderRadius: 4, backgroundColor: '#0F4463', justifyContent: 'center', alignItems: 'center' },
    severityNum: { color: 'white', fontWeight: 'bold' },

    cameraBtn: { backgroundColor: '#0F4463', flexDirection: 'row', justifyContent: 'center', alignItems: 'center', padding: 14, borderRadius: 8, borderStyle: 'dashed', borderWidth: 1, borderColor: '#38BDF8' },
    cameraBtnText: { color: 'white', marginLeft: 10, fontWeight: '600', fontSize: 16 },
    imagePreviewContainer: { marginTop: 15, position: 'relative' },
    imagePreview: { width: '100%', height: 200, borderRadius: 8 },
    removeImageBtn: { position: 'absolute', top: 10, right: 10, backgroundColor: 'rgba(0,0,0,0.5)', borderRadius: 20 },

    mapContainer: { height: 150, borderRadius: 8, overflow: 'hidden', backgroundColor: '#072C42', borderWidth: 1, borderColor: '#0F4463' },
    map: { width: '100%', height: '100%' },
    mapLoader: { flex: 1, justifyContent: 'center', alignItems: 'center' },
    helperText: { color: '#648A9F', fontSize: 11, marginTop: 6, fontStyle: 'italic' },

    footer: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, backgroundColor: '#031B2A', borderTopWidth: 1, borderTopColor: '#0F4463' },
    submitBtn: { backgroundColor: '#10B981', padding: 16, borderRadius: 8, flexDirection: 'row', justifyContent: 'center', alignItems: 'center' },
    submitBtnDisabled: { opacity: 0.5 },
    submitBtnText: { color: 'white', fontSize: 16, fontWeight: 'bold' },
});
