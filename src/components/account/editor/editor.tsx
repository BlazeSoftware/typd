import { h, Component, Prop, State } from '@stencil/core';
import { RouterHistory } from '@stencil/router';
import firebase, { store } from '@/firebase/firebase';
import moment from 'moment';
import _debounce from 'lodash.debounce';

const DEBOUNCE_TIMEOUT = 1000;

@Component({
  tag: 'document-editor',
  styleUrl: 'editor.scss',
  shadow: true,
})
export class Editor {
  textareaRef: any;

  @Prop()
  history: RouterHistory;

  @Prop()
  docId: string;

  @State()
  showActions: boolean = false;

  @State()
  showPreview: boolean = false;

  @State()
  loading: boolean = true;

  @State()
  saveMessage: string = '';

  @State()
  doc: any;

  @State()
  noDoc: boolean = false;

  docSnapshot: any;

  firebaseUnsubscribe: any;
  onDocSnapshot: any;
  statusChecker: any = setInterval(() => {
    this.updateStatus();
  }, 30000);

  componentDidUnload() {
    if (this.onDocSnapshot) this.onDocSnapshot();
    if (this.firebaseUnsubscribe) this.firebaseUnsubscribe();
    clearInterval(this.statusChecker);
  }

  componentWillLoad() {
    this.firebaseUnsubscribe = firebase.auth().onAuthStateChanged(async (user) => {
      if (!user) return this.history.push('/login');

      if (!this.docId) return this.history.push('/documents');

      const docRef = await store.collection('documents').doc(this.docId);
      this.onDocSnapshot = docRef.onSnapshot(
        (snapshot) => {
          if (!snapshot.exists) {
            this.noDoc = true;
          } else {
            this.docSnapshot = snapshot;
            if (!this.doc) {
              this.doc = this.docSnapshot.data();
              if (this.doc && typeof this.doc.shared === 'undefined') {
                this.doc.shared = false;
              }
            }
            this.updateStatus();
          }

          this.loading = false;
        },
        () => {
          this.noDoc = true;
          this.loading = false;
        }
      );

      await docRef.get();
    });
  }

  updateStatus() {
    if (this.docSnapshot) {
      const updated = this.docSnapshot.data().updated;
      if (updated) {
        return (this.saveMessage = `Saved ${moment(updated.toDate()).fromNow()}.`);
      }
    }
  }

  handleTitleInput(e) {
    this.doc.title = e.target.value;
    this.saveMessage = 'Saving...';
    this.saveDoc();
  }

  handleBodyInput(e) {
    this.doc.body = e.target.value;
    this.saveMessage = 'Saving...';
    this.saveDoc();
  }

  async toggleShared() {
    this.saveMessage = 'Saving...';
    this.doc = { ...this.doc, shared: !this.doc.shared };
    await this.docSnapshot.ref.set(
      {
        shared: this.doc.shared,
        updated: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
    this.updateStatus();
  }

  saveDoc = _debounce(this._saveDoc, DEBOUNCE_TIMEOUT);
  private async _saveDoc() {
    await this.docSnapshot.ref.set(
      {
        title: this.doc.title || '',
        body: this.doc.body || '',
        updated: firebase.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    this.updateStatus();
  }

  async deleteDoc() {
    if (confirm('Are you sure you want to delete this document?')) {
      await store
        .collection('documents')
        .doc(this.docId)
        .delete();

      this.history.push('/documents');
    }
  }

  content() {
    if (this.noDoc) return <document-not-found url="/documents" action-text="back to document list" />;
    if (this.loading) return <loading-status status="loading" />;
    if (this.doc)
      return (
        <div class="editor">
          <div class="status">{this.saveMessage}</div>
          <input
            type="text"
            value={this.doc.title}
            class="title"
            aria-label="Title of the document"
            placeholder="Title..."
            onInput={(e) => this.handleTitleInput(e)}
          />
          {this.showPreview ? (
            <div class="body">
              <render-markdown content={this.doc.body} />
            </div>
          ) : (
            <textarea
              ref={(textarea) => (this.textareaRef = textarea)}
              class="body"
              onInput={(e) => this.handleBodyInput(e)}
              value={this.doc.body}
              aria-label="Document body"
              placeholder="Write something amazing..."
            />
          )}
          <button class="actions preview" onClick={() => (this.showPreview = !this.showPreview)}>
            {this.showPreview ? 'Edit' : 'Preview'}
          </button>
          <button
            class="actions"
            onClick={() => {
              this.showActions = !this.showActions;
            }}>
            {this.showActions ? 'Close' : 'Actions'}
          </button>
          {this.showActions && (
            <div class="toolbar">
              <button class="action toggle" onClick={() => this.toggleShared()}>
                {this.doc.shared ? 'Set to private' : 'Share'}
              </button>
              {this.doc.shared && [
                <a href={`https://typd.org/-/${this.docId}`} class="action link" target="_blank">
                  https://typd.org/-/{this.docId}
                </a>,
                <a
                  class="action share twitter"
                  target="_blank"
                  href={`https://twitter.com/intent/tweet?text=https://typd.org/-/${this.docId}`}>
                  Twitter
                </a>,
                <a
                  class="action share facebook"
                  target="_blank"
                  href={`https://www.facebook.com/sharer/sharer.php?u=https://typd.org/-/${this.docId}`}>
                  Facebook
                </a>,
              ]}
              {!this.doc.shared && (
                <button class="action delete" onClick={() => this.deleteDoc()}>
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      );
  }

  render() {
    return (
      <div>
        <stencil-route-title pageTitle="Editor" />
        {this.content()}
      </div>
    );
  }
}
