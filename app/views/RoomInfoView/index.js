import React from 'react';
import PropTypes from 'prop-types';
import { View, Text, ScrollView } from 'react-native';
import { BorderlessButton } from 'react-native-gesture-handler';
import { connect } from 'react-redux';
import { SafeAreaView } from 'react-navigation';
import _ from 'lodash';

import database from '../../lib/database';
import { CustomIcon } from '../../lib/Icons';
import Status from '../../containers/Status';
import Avatar from '../../containers/Avatar';
import styles from './styles';
import sharedStyles from '../Styles';
import RocketChat from '../../lib/rocketchat';
import RoomTypeIcon from '../../containers/RoomTypeIcon';
import I18n from '../../i18n';
import { CustomHeaderButtons } from '../../containers/HeaderButton';
import StatusBar from '../../containers/StatusBar';
import log from '../../utils/log';
import { themes } from '../../constants/colors';
import { withTheme } from '../../theme';
import { themedHeader } from '../../utils/navigation';
import { getUserSelector } from '../../selectors/login';
import Markdown from '../../containers/markdown';

import Livechat from './Livechat';
import Channel from './Channel';
import Item from './Item';
import Direct from './Direct';

const PERMISSION_EDIT_ROOM = 'edit-room';
const getRoomTitle = (room, type, name, username, statusText, theme) => (type === 'd'
	? (
		<>
			<Text testID='room-info-view-name' style={[styles.roomTitle, { color: themes[theme].titleText }]}>{ name }</Text>
			{username && <Text testID='room-info-view-username' style={[styles.roomUsername, { color: themes[theme].auxiliaryText }]}>{`@${ username }`}</Text>}
			{!!statusText && <View testID='room-info-view-custom-status'><Markdown msg={statusText} style={[styles.roomUsername, { color: themes[theme].auxiliaryText }]} preview theme={theme} /></View>}
		</>
	)
	: (
		<View style={styles.roomTitleRow}>
			<RoomTypeIcon type={room.prid ? 'discussion' : room.t} key='room-info-type' theme={theme} />
			<Text testID='room-info-view-name' style={[styles.roomTitle, { color: themes[theme].titleText }]} key='room-info-name'>{RocketChat.getRoomTitle(room)}</Text>
		</View>
	)
);

class RoomInfoView extends React.Component {
	static navigationOptions = ({ navigation, screenProps }) => {
		const showEdit = navigation.getParam('showEdit');
		const livechat = navigation.getParam('livechat');
		const visitor = navigation.getParam('visitor');
		const rid = navigation.getParam('rid');
		const t = navigation.getParam('t');
		return {
			title: t === 'd' ? I18n.t('User_Info') : I18n.t('Room_Info'),
			...themedHeader(screenProps.theme),
			headerRight: showEdit
				? (
					<CustomHeaderButtons>
						<Item
							iconName='edit'
							onPress={() => navigation.navigate(t === 'l' ? 'LivechatEditView' : 'RoomInfoEditView', { rid, visitor, livechat })}
							testID='room-info-view-edit-button'
						/>
					</CustomHeaderButtons>
				)
				: null
		};
	}

	static propTypes = {
		navigation: PropTypes.object,
		user: PropTypes.shape({
			id: PropTypes.string,
			token: PropTypes.string
		}),
		baseUrl: PropTypes.string,
		theme: PropTypes.string
	}

	constructor(props) {
		super(props);
		const room = props.navigation.getParam('room');
		const roomUser = props.navigation.getParam('member');
		this.rid = props.navigation.getParam('rid');
		this.t = props.navigation.getParam('t');
		this.state = {
			room: room || { rid: this.rid, t: this.t },
			roomUser: roomUser || {}
		};
	}

	componentDidMount() {
		if (!this.isDirect && !this.isLivechat) {
			this.loadRoom();
		} else if (this.isDirect) {
			this.loadUser();
		}
	}

	componentWillUnmount() {
		if (this.subscription && this.subscription.unsubscribe) {
			this.subscription.unsubscribe();
		}
	}

	get isDirect() {
		return this.t === 'd';
	}

	get isLivechat() {
		return this.t === 't';
	}

	getRoleDescription = async(id) => {
		const db = database.active;
		try {
			const rolesCollection = db.collections.get('roles');
			const role = await rolesCollection.find(id);
			if (role) {
				return role.description;
			}
			return null;
		} catch (e) {
			return null;
		}
	};

	loadUser = async() => {
		const { room: roomState, roomUser } = this.state;

		if (_.isEmpty(roomUser)) {
			try {
				const roomUserId = RocketChat.getUidDirectMessage(roomState);
				const result = await RocketChat.getUserInfo(roomUserId);
				if (result.success) {
					const { user } = result;
					const { roles } = user;
					if (roles && roles.length) {
						user.parsedRoles = await Promise.all(roles.map(async(role) => {
							const description = await this.getRoleDescription(role);
							return description;
						}));
					}

					const room = await this.getDirect(user.username);

					this.setState({ roomUser: user, room: { ...roomState, rid: room.rid } });
				}
			} catch {
				// do nothing
			}
		}
	}

	loadRoom = async() => {
		const { navigation } = this.props;
		let room = navigation.getParam('room');
		if (room && room.observe) {
			this.roomObservable = room.observe();
			this.subscription = this.roomObservable
				.subscribe((changes) => {
					this.setState({ room: changes });
				});
		} else {
			try {
				const result = await RocketChat.getRoomInfo(this.rid);
				if (result.success) {
					({ room } = result);
					this.setState({ room });
				}
			} catch (e) {
				log(e);
			}
		}

		const permissions = await RocketChat.hasPermission([PERMISSION_EDIT_ROOM], room.rid);
		if (permissions[PERMISSION_EDIT_ROOM] && !room.prid) {
			navigation.setParams({ showEdit: true });
		}
	}

	getDirect = async(username) => {
		try {
			const result = await RocketChat.createDirectMessage(username);
			if (result.success) {
				return result.room;
			}
		} catch {
			// do nothing
		}
	}

	goRoom = async() => {
		const { roomUser, room } = this.state;
		const { navigation } = this.props;
		try {
			if (room.rid) {
				await navigation.navigate('RoomsListView');
				navigation.navigate('RoomView', { rid: room.rid, name: RocketChat.getRoomTitle(roomUser), t: 'd' });
			}
		} catch (e) {
			// do nothing
		}
	}

	videoCall = () => {
		const { room } = this.state;
		RocketChat.callJitsi(room.rid);
	}

	renderAvatar = (room, roomUser) => {
		const { baseUrl, user, theme } = this.props;

		return (
			<Avatar
				text={room.name || roomUser.username}
				size={100}
				style={styles.avatar}
				type={this.t}
				baseUrl={baseUrl}
				userId={user.id}
				token={user.token}
			>
				{this.t === 'd' && roomUser._id ? <Status style={[sharedStyles.status, styles.status]} theme={theme} size={24} id={roomUser._id} /> : null}
			</Avatar>
		);
	}

	renderButton = (onPress, iconName, text) => {
		const { theme } = this.props;
		return (
			<BorderlessButton
				onPress={onPress}
				style={styles.roomButton}
			>
				<CustomIcon
					name={iconName}
					size={30}
					color={themes[theme].actionTintColor}
				/>
				<Text style={[styles.roomButtonText, { color: themes[theme].actionTintColor }]}>{text}</Text>
			</BorderlessButton>
		);
	}

	renderButtons = () => (
		<View style={styles.roomButtonsContainer}>
			{this.renderButton(this.goRoom, 'message', I18n.t('Message'))}
			{this.renderButton(this.videoCall, 'video', I18n.t('Video_call'))}
		</View>
	)

	renderContent = () => {
		const { room, roomUser } = this.state;
		const { navigation, theme } = this.props;

		if (this.isDirect) {
			return <Direct roomUser={roomUser} theme={theme} />;
		} else if (this.t === 'l') {
			return <Livechat rid={room.rid} navigation={navigation} theme={theme} />;
		}
		return <Channel room={room} theme={theme} />;
	}

	render() {
		const { room, roomUser } = this.state;
		const { theme } = this.props;
		return (
			<ScrollView style={[styles.scroll, { backgroundColor: themes[theme].backgroundColor }]}>
				<StatusBar theme={theme} />
				<SafeAreaView
					style={[styles.container, { backgroundColor: themes[theme].backgroundColor }]}
					forceInset={{ vertical: 'never' }}
					testID='room-info-view'
				>
					<View style={[styles.avatarContainer, this.isDirect && styles.avatarContainerDirectRoom, { backgroundColor: themes[theme].auxiliaryBackground }]}>
						{this.renderAvatar(room, roomUser)}
						<View style={styles.roomTitleContainer}>{ getRoomTitle(room, this.t, roomUser?.name, roomUser?.username, roomUser?.statusText, theme) }</View>
						{this.isDirect ? this.renderButtons() : null}
					</View>
					{this.renderContent()}
				</SafeAreaView>
			</ScrollView>
		);
	}
}

const mapStateToProps = state => ({
	baseUrl: state.server.server,
	user: getUserSelector(state)
});

export default connect(mapStateToProps)(withTheme(RoomInfoView));
